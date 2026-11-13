import "server-only";
import { inArray } from "drizzle-orm";
import { getDb } from "../db";
import { leadAlerts } from "../db/schema";
import { collectLeadInputs, fetchTodaySoFar } from "./collect";
import { detectLeadAlerts, type LeadFinding } from "./detect";
import { notifyLeadAlerts, type LeadAlertEvent } from "./notify";

// One alert check: find what's wrong now, compare with the alerts already
// open, and tell people about what changed — a new problem, a reminder for
// one still open and unacknowledged after 48 hours, or leads coming back.

const REMIND_AFTER_MS = 48 * 60 * 60 * 1000;

export interface LeadAlertRunResult {
  checked: number;
  opened: number;
  reminded: number;
  resolved: number;
  open: number;
  notified: { slack: string; email: string };
}

export async function runLeadAlerts(options: { now?: Date; includeToday?: boolean; budgetMs?: number } = {}): Promise<LeadAlertRunResult> {
  const now = options.now ?? new Date();
  const db = await getDb();
  const inputs = await collectLeadInputs(now);
  const today = options.includeToday ? await fetchTodaySoFar(inputs, now, options.budgetMs ?? 180_000) : null;

  const existing = await db.select().from(leadAlerts).where(inArray(leadAlerts.status, ["open", "acknowledged"]));
  const events: LeadAlertEvent[] = [];
  let opened = 0;
  let reminded = 0;
  let resolved = 0;
  const stillOpen = new Set<string>();

  for (const input of inputs) {
    const mine = existing.filter((a) => a.clientId === input.clientId);
    const findings: LeadFinding[] = input.paused
      ? []
      : detectLeadAlerts({
          total: input.total,
          sources: input.sources,
          sensitivity: input.sensitivity,
          today: today?.get(input.clientId)?.total ?? null,
          todayBySource: today?.get(input.clientId)?.bySource,
        });
    const base = { clientId: input.clientId, clientName: input.clientName, owner: input.owner };

    for (const finding of findings) {
      // "stopped" and "drop" are the same problem getting worse or better:
      // one alert for the total, updated in place.
      const match = mine.find(
        (a) => a.source === finding.source && (a.kind === finding.kind || (finding.source === "total" && ["stopped", "drop"].includes(a.kind))),
      );
      if (!match) {
        const inserted = await db
          .insert(leadAlerts)
          .values({
            clientId: input.clientId,
            kind: finding.kind,
            source: finding.source,
            severity: finding.severity,
            message: finding.message,
            detail: finding.detail,
            lastNotifiedAt: now,
          })
          .returning();
        opened += 1;
        stillOpen.add(inserted[0].id);
        events.push({ ...base, type: "new", alertId: inserted[0].id, kind: finding.kind, severity: finding.severity, message: finding.message, detail: finding.detail });
        continue;
      }
      stillOpen.add(match.id);
      const escalated = match.kind === "drop" && finding.kind === "stopped";
      const due = match.status === "open" && (!match.lastNotifiedAt || now.getTime() - match.lastNotifiedAt.getTime() > REMIND_AFTER_MS);
      await db
        .update(leadAlerts)
        .set({
          kind: finding.kind,
          severity: finding.severity,
          message: finding.message,
          detail: finding.detail,
          updatedAt: now,
          // Escalating to "stopped" re-opens an acknowledged drop.
          ...(escalated ? { status: "open", acknowledgedAt: null, acknowledgedBy: null } : {}),
          ...(escalated || due ? { lastNotifiedAt: now } : {}),
        })
        .where(inArray(leadAlerts.id, [match.id]));
      if (escalated || due) {
        reminded += 1;
        events.push({
          ...base,
          type: escalated ? "new" : "reminder",
          alertId: match.id,
          kind: finding.kind,
          severity: finding.severity,
          message: finding.message,
          detail: finding.detail,
          openedAt: match.openedAt.toISOString(),
        });
      }
    }

    for (const alert of mine) {
      if (stillOpen.has(alert.id)) continue;
      await db
        .update(leadAlerts)
        .set({ status: "resolved", resolvedAt: now, resolvedBy: input.paused ? "alerts paused" : "leads back", updatedAt: now })
        .where(inArray(leadAlerts.id, [alert.id]));
      resolved += 1;
      if (!input.paused) {
        events.push({
          ...base,
          type: "resolved",
          alertId: alert.id,
          kind: alert.kind as LeadFinding["kind"],
          severity: alert.severity as LeadFinding["severity"],
          message: alert.kind === "data_missing" ? "Lead data is coming through again" : "Leads are coming in again",
          detail: {},
          openedAt: alert.openedAt.toISOString(),
        });
      }
    }
  }

  // Alerts for clients that were archived or turned off since.
  const liveIds = new Set(inputs.map((i) => i.clientId));
  const orphaned = existing.filter((a) => !liveIds.has(a.clientId)).map((a) => a.id);
  if (orphaned.length > 0) {
    await db.update(leadAlerts).set({ status: "resolved", resolvedAt: now, resolvedBy: "client inactive", updatedAt: now }).where(inArray(leadAlerts.id, orphaned));
  }

  const notified = await notifyLeadAlerts(events);
  return { checked: inputs.length, opened, reminded, resolved, open: stillOpen.size, notified };
}
