import "server-only";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { addDays, format, subDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getDb } from "../db";
import { clientPlatformAccounts, clients, metricSnapshots, rawResponses } from "../db/schema";
import { connectorRegistry } from "../connectors/registry";
import type { Platform } from "../connectors/types";
import { countedLeadSources, leadSourceInfo, leadsFromSnapshot, type LeadSource } from "../leads/sources";
import { isSensitivity, type DayValue, type LeadAlertSensitivity, type LeadSeries, type TodaySoFar } from "./detect";

// Builds each client's daily lead series per counted source from the
// stored snapshots, and (for the afternoon check) asks the fast lead
// platforms for today so far. A connected source with no snapshot on a
// synced day had no leads that day (the sync writes no snapshot for an
// empty day); a day whose sync failed is unknown, never zero.

const KEY = "yyyy-MM-dd";
const HISTORY_DAYS = 70;
// A source not synced for this long is reported as not syncing.
const STALE_MS = 36 * 60 * 60 * 1000;
// Asked for today's leads in the afternoon. Google Ads is left out: its
// rate limit (one request per 30 s) can't cover every client in time.
const TODAY_PLATFORMS: Platform[] = ["lead_dashboard", "ghl", "openphone", "meta"];

export interface ClientLeadInput {
  clientId: string;
  clientName: string;
  timezone: string;
  owner: string | null;
  sensitivity: LeadAlertSensitivity;
  paused: boolean;
  total: LeadSeries;
  sources: LeadSeries[];
  // Platform account per counted source, for the today fetch.
  accounts: Partial<Record<LeadSource, typeof clientPlatformAccounts.$inferSelect>>;
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); format(d, KEY) <= to; d = addDays(d, 1)) out.push(format(d, KEY));
  return out;
}

export async function collectLeadInputs(now: Date): Promise<ClientLeadInput[]> {
  const db = await getDb();
  const live = await db.select().from(clients).where(and(eq(clients.active, true), isNull(clients.archivedAt)));
  if (live.length === 0) return [];
  const ids = live.map((c) => c.id);
  const leadPlatforms: Platform[] = ["lead_dashboard", "ghl", "openphone", "meta", "google_ads"];
  const since = format(subDays(now, HISTORY_DAYS + 1), KEY);

  const [accounts, snapshots, raws] = await Promise.all([
    db
      .select()
      .from(clientPlatformAccounts)
      .where(and(inArray(clientPlatformAccounts.clientId, ids), eq(clientPlatformAccounts.active, true))),
    db
      .select({ clientId: metricSnapshots.clientId, platform: metricSnapshots.platform, date: metricSnapshots.date, metrics: metricSnapshots.metrics })
      .from(metricSnapshots)
      .where(and(inArray(metricSnapshots.clientId, ids), inArray(metricSnapshots.platform, leadPlatforms), gte(metricSnapshots.date, since))),
    db
      .select({ clientId: rawResponses.clientId, platform: rawResponses.platform, fetchedAt: rawResponses.fetchedAt, payload: rawResponses.payload })
      .from(rawResponses)
      .where(and(inArray(rawResponses.clientId, ids), inArray(rawResponses.platform, leadPlatforms), gte(rawResponses.fetchedAt, subDays(now, 4)))),
  ]);

  const out: ClientLeadInput[] = [];
  for (const client of live) {
    const mine = accounts.filter((a) => a.clientId === client.id);
    const counted = countedLeadSources((p) => mine.some((a) => a.platform === p), client.leadSourcesOff);
    const yesterday = format(subDays(toZonedTime(now, client.timezone), 1), KEY);
    const sources: LeadSeries[] = [];
    const accountBySource: ClientLeadInput["accounts"] = {};

    for (const source of counted) {
      const info = leadSourceInfo(source);
      accountBySource[source] = mine.find((a) => a.platform === info.platform);
      const snaps = snapshots.filter((s) => s.clientId === client.id && s.platform === info.platform && s.date <= yesterday);
      const runs = raws
        .filter((r) => r.clientId === client.id && r.platform === info.platform)
        .sort((a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime());

      // Days whose sync failed: the morning sync fetches the day before.
      const failedDays = new Set(
        runs
          .filter((r) => isObj(r.payload) && "error" in r.payload)
          .map((r) => format(subDays(toZonedTime(r.fetchedAt, client.timezone), 1), KEY)),
      );
      const byDate = new Map(snaps.map((s) => [s.date, leadsFromSnapshot(source, s.metrics)]));
      const first = snaps.map((s) => s.date).sort()[0];
      const days: DayValue[] = first
        ? dateRange(first, yesterday).map((date) => ({
            date,
            value: byDate.has(date) ? (byDate.get(date) ?? null) : failedDays.has(date) ? null : 0,
          }))
        : [];

      const latest = runs[runs.length - 1];
      let dataProblem: string | null = null;
      if (latest && isObj(latest.payload) && "error" in latest.payload) {
        dataProblem = `the last sync failed (${String(latest.payload.error).slice(0, 160)})`;
      } else if (latest && now.getTime() - latest.fetchedAt.getTime() > STALE_MS) {
        dataProblem = `it hasn't synced since ${format(toZonedTime(latest.fetchedAt, client.timezone), "MMM d")}`;
      } else if (!latest && days.length > 0) {
        dataProblem = "it hasn't synced for over 4 days";
      }
      sources.push({ source, label: info.label, days, dataProblem });
    }

    // Total: the sources that are syncing, added up per day.
    const healthy = sources.filter((s) => !s.dataProblem && s.days.length > 0);
    const firstTotal = healthy.map((s) => s.days[0].date).sort()[0];
    const totalDays: DayValue[] = firstTotal
      ? dateRange(firstTotal, yesterday).map((date) => {
          const values = healthy.map((s) => s.days.find((d) => d.date === date)?.value).filter((v): v is number | null => v !== undefined);
          const known = values.filter((v): v is number => v !== null);
          return { date, value: values.length > 0 && known.length === 0 ? null : known.reduce((a, b) => a + b, 0) };
        })
      : [];

    out.push({
      clientId: client.id,
      clientName: client.name,
      timezone: client.timezone,
      owner: client.leadAlertOwner,
      sensitivity: isSensitivity(client.leadAlertSensitivity) ? client.leadAlertSensitivity : "normal",
      paused: client.leadAlertsPaused,
      total: { source: "total", label: "All leads", days: totalDays, dataProblem: null },
      sources,
      accounts: accountBySource,
    });
  }
  return out;
}

// Today so far, per source and in total. The total is only given when every
// syncing source answered — a missing source can't be read as "no leads".
export async function fetchTodaySoFar(
  inputs: ClientLeadInput[],
  now: Date,
  budgetMs: number,
): Promise<Map<string, { total: TodaySoFar | null; bySource: Record<string, TodaySoFar> }>> {
  const started = Date.now();
  const result = new Map<string, { total: TodaySoFar | null; bySource: Record<string, TodaySoFar> }>();
  const work: { input: ClientLeadInput; source: LeadSource }[] = [];
  for (const input of inputs) {
    if (input.paused) continue;
    for (const s of input.sources) {
      const source = s.source as LeadSource;
      const account = input.accounts[source];
      if (!s.dataProblem && account && TODAY_PLATFORMS.includes(account.platform)) work.push({ input, source });
    }
  }

  const answers = new Map<string, Record<string, number>>();
  async function worker() {
    while (work.length > 0 && Date.now() - started < budgetMs) {
      const item = work.shift();
      if (!item) break;
      const account = item.input.accounts[item.source]!;
      const connector = connectorRegistry[account.platform];
      if (!connector) continue;
      const midnight = fromZonedTime(`${format(toZonedTime(now, item.input.timezone), KEY)}T00:00:00.000`, item.input.timezone);
      try {
        const res = await connector.fetch(
          {
            clientId: item.input.clientId,
            clientTimezone: item.input.timezone,
            platform: account.platform,
            externalId: account.externalId,
            credentialLabel: account.credentialLabel,
          },
          { start: midnight, end: now },
        );
        const value = res.status === "no_data" ? 0 : res.status === "ok" ? leadsFromSnapshot(item.source, res.data) : null;
        if (value === null) continue;
        const map = answers.get(item.input.clientId) ?? {};
        map[item.source] = value;
        answers.set(item.input.clientId, map);
      } catch {
        // Unknown for today; the morning numbers still stand.
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));

  for (const input of inputs) {
    const got = answers.get(input.clientId) ?? {};
    const local = toZonedTime(now, input.timezone);
    const fraction = Math.min(1, (local.getHours() * 60 + local.getMinutes()) / 1440);
    const bySource: Record<string, TodaySoFar> = {};
    for (const [source, value] of Object.entries(got)) bySource[source] = { value, fraction };
    const syncing = input.sources.filter((s) => !s.dataProblem && s.days.length > 0);
    const allAnswered = syncing.length > 0 && syncing.every((s) => s.source in got);
    result.set(input.clientId, {
      total: allAnswered ? { value: Object.values(got).reduce((a, b) => a + b, 0), fraction } : null,
      bySource,
    });
  }
  return result;
}
