import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { getDb } from "../db";
import { clients, leadAlerts } from "../db/schema";
import { collectLeadInputs, fetchTodaySoFar, type ClientLeadInput } from "./collect";
import { detectLeadAlerts, isRecovered, type LeadAlertKind, type LeadFinding } from "./detect";
import { notifyLeadAlerts, type LeadAlertEvent } from "./notify";

// One alert check: find what's wrong now, compare with the alerts already
// open, and tell people only about what matters. Built to stay quiet:
// - only "leads stopped" and "a source stopped" are pushed (email + Slack)
//   when they open; drops and sync problems stay on Insights and in the
//   daily summary (a sync problem is pushed once if still open after 48 h);
// - one reminder after 48 h if nobody acknowledged or snoozed it, then none;
// - an alert closes only when leads are really back (half a normal day),
//   and the same problem returning within 3 days reopens it silently;
// - per client, at most one push a day and three a week;
// - "leads are back" goes to Slack only, and only for alerts that were
//   pushed.

const HOUR = 60 * 60 * 1000;
const REMIND_AFTER_MS = 48 * HOUR;
const REOPEN_WITHIN_MS = 72 * HOUR;
const DAY_CAP_MS = 24 * HOUR;
const WEEK_MS = 7 * 24 * HOUR;
const WEEKLY_CAP = 3;

type AlertRow = typeof leadAlerts.$inferSelect;

export interface LeadAlertRunResult {
  checked: number;
  opened: number;
  reopened: number;
  resolved: number;
  pushed: number;
  heldByCap: number;
  open: number;
  notified: { slack: string; email: string };
}

const PUSH_ON_OPEN: LeadAlertKind[] = ["stopped", "source_stopped"];

// "stopped" and "drop" are one problem on the total getting worse or
// better; every other kind is matched on kind and source.
function sameProblem(a: { kind: string; source: string }, f: LeadFinding): boolean {
  if (a.source !== f.source) return false;
  if (f.source === "total" && ["stopped", "drop"].includes(a.kind) && ["stopped", "drop"].includes(f.kind)) return true;
  return a.kind === f.kind;
}

function seriesFor(input: ClientLeadInput, source: string) {
  return source === "total" ? input.total : input.sources.find((s) => s.source === source);
}

export async function runLeadAlerts(options: { now?: Date; includeToday?: boolean; budgetMs?: number } = {}): Promise<LeadAlertRunResult> {
  const now = options.now ?? new Date();
  const db = await getDb();
  const inputs = await collectLeadInputs(now);
  const today = options.includeToday ? await fetchTodaySoFar(inputs, now, options.budgetMs ?? 180_000) : null;

  const [active, recentlyResolved, pushLogs] = await Promise.all([
    db.select().from(leadAlerts).where(inArray(leadAlerts.status, ["open", "acknowledged"])),
    db
      .select()
      .from(leadAlerts)
      .where(and(eq(leadAlerts.status, "resolved"), gte(leadAlerts.resolvedAt, new Date(now.getTime() - REOPEN_WITHIN_MS)))),
    db.select({ id: clients.id, pushes: clients.leadAlertPushes }).from(clients),
  ]);
  const pushesOf = new Map(pushLogs.map((c) => [c.id, (c.pushes ?? []).map((t) => Date.parse(t)).filter(Number.isFinite)]));

  const events: LeadAlertEvent[] = [];
  const result = { opened: 0, reopened: 0, resolved: 0, pushed: 0, heldByCap: 0 };
  const stillOpen = new Set<string>();
  const set = (id: string, patch: Partial<typeof leadAlerts.$inferInsert>) => db.update(leadAlerts).set({ ...patch, updatedAt: now }).where(eq(leadAlerts.id, id));

  for (const input of inputs) {
    const mine = active.filter((a) => a.clientId === input.clientId);
    const resolvedMine = recentlyResolved.filter((a) => a.clientId === input.clientId);
    const local = toZonedTime(now, input.timezone);
    const todayDate = format(local, "yyyy-MM-dd");
    const todayTotal = today?.get(input.clientId)?.total ?? null;
    const todayBySource = today?.get(input.clientId)?.bySource;
    const findings: LeadFinding[] = input.paused
      ? []
      : detectLeadAlerts({ total: input.total, sources: input.sources, sensitivity: input.sensitivity, today: todayTotal, todayBySource, todayDate });
    const base = { clientId: input.clientId, clientName: input.clientName, owner: input.owner };

    // Alerts that want a push this run: [row id, event].
    const wantPush: { id: string; event: LeadAlertEvent; reminder: boolean }[] = [];
    const snoozed = (a: AlertRow) => a.snoozedUntil !== null && a.snoozedUntil.getTime() > now.getTime();

    for (const finding of findings) {
      const event = { ...base, kind: finding.kind, severity: finding.severity, message: finding.message, detail: finding.detail };
      const match = mine.find((a) => sameProblem(a, finding));
      if (match) {
        stillOpen.add(match.id);
        const escalated = match.kind === "drop" && finding.kind === "stopped";
        await set(match.id, {
          kind: finding.kind,
          severity: finding.severity,
          message: finding.message,
          detail: finding.detail,
          // A drop turning into a full stop is a new, more serious problem.
          ...(escalated ? { status: "open", acknowledgedAt: null, acknowledgedBy: null, remindedAt: null } : {}),
        });
        if (snoozed(match)) continue;
        if (escalated) {
          wantPush.push({ id: match.id, event: { ...event, type: "new", alertId: match.id }, reminder: false });
          continue;
        }
        const old = now.getTime() - match.openedAt.getTime() > REMIND_AFTER_MS;
        const worthReminding = PUSH_ON_OPEN.includes(finding.kind) || finding.kind === "data_missing";
        if (match.status === "open" && !match.remindedAt && old && worthReminding) {
          wantPush.push({
            id: match.id,
            event: { ...event, type: "reminder", alertId: match.id, openedAt: match.openedAt.toISOString() },
            reminder: true,
          });
        }
        continue;
      }

      // Same problem closed in the last 3 days: it never really went away.
      const recent = resolvedMine.find((a) => sameProblem(a, finding));
      if (recent) {
        await set(recent.id, {
          status: "open",
          resolvedAt: null,
          resolvedBy: null,
          kind: finding.kind,
          severity: finding.severity,
          message: finding.message,
          detail: finding.detail,
        });
        stillOpen.add(recent.id);
        result.reopened += 1;
        continue;
      }

      const inserted = await db
        .insert(leadAlerts)
        .values({ clientId: input.clientId, kind: finding.kind, source: finding.source, severity: finding.severity, message: finding.message, detail: finding.detail })
        .returning();
      const id = inserted[0].id;
      stillOpen.add(id);
      result.opened += 1;
      if (PUSH_ON_OPEN.includes(finding.kind)) wantPush.push({ id, event: { ...event, type: "new", alertId: id }, reminder: false });
    }

    // Alerts no longer found. A stop only closes once leads are really
    // back; otherwise it stays open, quietly.
    for (const alert of mine) {
      if (stillOpen.has(alert.id)) continue;
      const series = seriesFor(input, alert.source);
      const stopKind = alert.kind === "stopped" || alert.kind === "source_stopped";
      if (!input.paused && stopKind && series && !isRecovered(series, alert.source === "total" ? todayTotal : todayBySource?.[alert.source], todayDate)) {
        stillOpen.add(alert.id);
        continue;
      }
      await set(alert.id, { status: "resolved", resolvedAt: now, resolvedBy: input.paused ? "alerts paused" : "leads back", snoozedUntil: null });
      result.resolved += 1;
      if (!input.paused && alert.pushed) {
        events.push({
          ...base,
          type: "resolved",
          alertId: alert.id,
          kind: alert.kind as LeadAlertKind,
          severity: alert.severity as LeadFinding["severity"],
          message: alert.kind === "data_missing" ? "Lead data is coming through again" : "Leads are coming in again",
          detail: {},
          openedAt: alert.openedAt.toISOString(),
        });
      }
    }

    // Caps: one push a day, three a week, per client. A held alert stays
    // on Insights, and its 48-hour reminder can still go out later.
    if (wantPush.length === 0) continue;
    const history = (pushesOf.get(input.clientId) ?? []).filter((t) => now.getTime() - t < WEEK_MS);
    const pushedToday = history.some((t) => now.getTime() - t < DAY_CAP_MS);
    if (pushedToday || history.length >= WEEKLY_CAP) {
      result.heldByCap += wantPush.length;
      continue;
    }
    for (const item of wantPush) {
      events.push(item.event);
      await set(item.id, { pushed: true, lastNotifiedAt: now, ...(item.reminder ? { remindedAt: now } : {}) });
    }
    result.pushed += 1;
    const log = [...history.map((t) => new Date(t).toISOString()), now.toISOString()].slice(-10);
    await db.update(clients).set({ leadAlertPushes: log }).where(eq(clients.id, input.clientId));
  }

  // Alerts for clients that were archived or turned off since.
  const liveIds = new Set(inputs.map((i) => i.clientId));
  const orphaned = active.filter((a) => !liveIds.has(a.clientId)).map((a) => a.id);
  if (orphaned.length > 0) {
    await db.update(leadAlerts).set({ status: "resolved", resolvedAt: now, resolvedBy: "client inactive", updatedAt: now }).where(inArray(leadAlerts.id, orphaned));
  }

  const notified = await notifyLeadAlerts(events);
  return { checked: inputs.length, ...result, open: stillOpen.size, notified };
}
