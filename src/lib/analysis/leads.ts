import { getDay, parseISO } from "date-fns";
import { leadDashboardDataSchema } from "../connectors/lead-dashboard/schema";
import { telephonyDataSchema } from "../connectors/openphone/schema";
import { googleAdsDataSchema } from "../connectors/google-ads/schema";
import { metaDataSchema } from "../connectors/meta/schema";
import { ga4DataSchema } from "../connectors/ga4/schema";
import { searchConsoleDataSchema } from "../connectors/search-console/schema";
import type { Platform } from "../connectors/types";
import { changeOf, type Period, type SnapshotLike } from "./facts";
import type { LeadChannel, LeadFunnelFacts, LeadWeekday, MetricFact } from "./types";
import { countedLeadSources, LEAD_SOURCES, leadsFromSnapshot, type LeadSource } from "../leads/sources";

// The leads picture across every account at once — plain arithmetic over
// the synced daily snapshots, like facts.ts. The AI only explains it.

type Schema<T> = { safeParse: (value: unknown) => { success: boolean; data?: T } };

interface Dated<T> {
  date: string;
  data: T;
}

function parsedRows<T>(rows: SnapshotLike[] | undefined, schema: Schema<T>, period: Period): Dated<T>[] {
  const out: Dated<T>[] = [];
  for (const row of rows ?? []) {
    if (row.date < period.start || row.date > period.end) continue;
    const result = schema.safeParse(row.metrics);
    if (result.success && result.data !== undefined) out.push({ date: row.date, data: result.data });
  }
  return out;
}

function total<T>(items: Dated<T>[], pick: (item: T) => number): number | null {
  return items.length === 0 ? null : items.reduce((sum, item) => sum + pick(item.data), 0);
}

function pct(part: number | null, whole: number | null): number | null {
  return part === null || whole === null || whole === 0 ? null : (part / whole) * 100;
}

function plus(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

function fact(label: string, unit: MetricFact["unit"], current: number | null, previous: number | null, lowerIsBetter = false): MetricFact {
  return { label, unit, current, previous, change: changeOf(current, previous), ...(lowerIsBetter ? { lowerIsBetter } : {}) };
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function byWeekday<T>(items: Dated<T>[], pick: (item: T) => number): (number | null)[] {
  if (items.length === 0) return DAYS.map(() => null);
  const totals = DAYS.map(() => 0);
  for (const item of items) totals[(getDay(parseISO(item.date)) + 6) % 7] += pick(item.data);
  return totals;
}

function channel(label: string, current: number | null, previous: number | null): LeadChannel {
  return { label, current, previous, change: changeOf(current, previous) };
}

// One source's leads over a period (lib/leads/sources.ts), null if no data.
function sourceLeads(rowsByPlatform: Map<Platform, SnapshotLike[]>, source: LeadSource, period: Period): number | null {
  const platform = LEAD_SOURCES.find((s) => s.key === source)!.platform;
  let sum = 0;
  let found = 0;
  for (const row of rowsByPlatform.get(platform) ?? []) {
    if (row.date < period.start || row.date > period.end) continue;
    const value = leadsFromSnapshot(source, row.metrics);
    if (value !== null) {
      sum += value;
      found += 1;
    }
  }
  return found > 0 ? sum : null;
}

export function buildLeadFunnel(
  rowsByPlatform: Map<Platform, SnapshotLike[]>,
  connected: Platform[],
  current: Period,
  previous: Period,
  leadSourcesOff: readonly string[] = [],
): LeadFunnelFacts | null {
  const has = (p: Platform) => connected.includes(p);
  // Total leads = every counted source added together — the same rule as
  // the dashboard's Leads column.
  const counted = countedLeadSources(has, leadSourcesOff);

  const ld = (period: Period) => parsedRows(rowsByPlatform.get("lead_dashboard"), leadDashboardDataSchema, period);
  const phone = (period: Period) => parsedRows(rowsByPlatform.get("openphone"), telephonyDataSchema, period);
  const gads = (period: Period) => parsedRows(rowsByPlatform.get("google_ads"), googleAdsDataSchema, period);
  const meta = (period: Period) => parsedRows(rowsByPlatform.get("meta"), metaDataSchema, period);
  const ga4 = (period: Period) => parsedRows(rowsByPlatform.get("ga4"), ga4DataSchema, period);
  const gsc = (period: Period) => parsedRows(rowsByPlatform.get("search_console"), searchConsoleDataSchema, period);

  const leads = (period: Period): number | null => {
    const values = counted.map((source) => sourceLeads(rowsByPlatform, source, period)).filter((v): v is number => v !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
  };
  const formLeads = (period: Period) => total(ld(period), (d) => d.totalLeads);
  const completed = (period: Period) => total(ld(period), (d) => d.byStatus.completed ?? 0);
  const abandoned = (period: Period) => total(ld(period), (d) => d.byStatus.abandoned ?? 0);
  const spam = (period: Period) => total(ld(period), (d) => d.spamLeads);
  const calls = (period: Period) => total(phone(period), (d) => d.totalCalls);
  const missed = (period: Period) => total(phone(period), (d) => d.missedCalls - d.missedAndForwardedCalls);
  const spend = (period: Period) => plus(total(gads(period), (d) => d.cost), total(meta(period), (d) => d.spend));
  const cpl = (period: Period) => {
    const s = spend(period);
    const l = leads(period);
    return s === null || l === null || l === 0 ? null : s / l;
  };

  const metrics: MetricFact[] = [];
  if (counted.length > 0) metrics.push(fact("Total leads (all sources)", "count", leads(current), leads(previous)));
  for (const source of counted) {
    const info = LEAD_SOURCES.find((s) => s.key === source)!;
    metrics.push(fact(`Leads · ${info.label}`, "count", sourceLeads(rowsByPlatform, source, current), sourceLeads(rowsByPlatform, source, previous)));
  }
  if (has("lead_dashboard")) {
    // Form quality, out of all form submissions (spam included).
    metrics.push(fact("Completed forms", "count", completed(current), completed(previous)));
    metrics.push(fact("Abandoned (unfinished) forms", "count", abandoned(current), abandoned(previous), true));
    metrics.push(fact("Form completion rate", "percent", pct(completed(current), formLeads(current)), pct(completed(previous), formLeads(previous))));
    metrics.push(fact("Spam forms", "count", spam(current), spam(previous), true));
    metrics.push(fact("Spam rate", "percent", pct(spam(current), formLeads(current)), pct(spam(previous), formLeads(previous)), true));
  }
  if (has("openphone")) {
    const answered = (period: Period) => {
      const c = calls(period);
      const m = missed(period);
      return c === null ? null : c - (m ?? 0);
    };
    metrics.push(fact("Phone calls", "count", calls(current), calls(previous)));
    metrics.push(fact("Answered calls", "count", answered(current), answered(previous)));
    metrics.push(fact("Missed-call rate", "percent", pct(missed(current), calls(current)), pct(missed(previous), calls(previous)), true));
  }
  if (has("google_ads") || has("meta")) {
    metrics.push(fact("Paid ad spend (Google + Meta)", "currency", spend(current), spend(previous)));
    if (counted.length > 0) metrics.push(fact("Blended cost per lead", "currency", cpl(current), cpl(previous), true));
  }
  if (metrics.length === 0) return null;

  // Where leads come from: each counted source's leads, then other signals.
  const channels: LeadChannel[] = counted.map((source) =>
    channel(LEAD_SOURCES.find((s) => s.key === source)!.label, sourceLeads(rowsByPlatform, source, current), sourceLeads(rowsByPlatform, source, previous)),
  );
  if (has("search_console")) channels.push(channel("Google search clicks", total(gsc(current), (d) => d.totalClicks), total(gsc(previous), (d) => d.totalClicks)));
  if (has("ga4")) {
    const bySource = (period: Period) => {
      const map = new Map<string, number>();
      for (const day of ga4(period)) for (const s of day.data.trafficSources) map.set(s.source, (map.get(s.source) ?? 0) + s.conversions);
      return map;
    };
    const cur = bySource(current);
    const prev = bySource(previous);
    for (const [name, value] of [...cur.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
      channels.push(channel(`Website conversions from ${name}`, value, prev.get(name) ?? null));
    }
  }

  const leadDays: (number | null)[] = DAYS.map(() => null);
  for (const source of counted) {
    const platform = LEAD_SOURCES.find((s) => s.key === source)!.platform;
    for (const row of rowsByPlatform.get(platform) ?? []) {
      if (row.date < current.start || row.date > current.end) continue;
      const value = leadsFromSnapshot(source, row.metrics);
      if (value === null) continue;
      const i = (getDay(parseISO(row.date)) + 6) % 7;
      leadDays[i] = (leadDays[i] ?? 0) + value;
    }
  }
  if (leadDays.some((v) => v !== null)) for (let i = 0; i < 7; i++) leadDays[i] ??= 0;
  const callDays = byWeekday(phone(current), (d) => d.totalCalls);
  const missedDays = byWeekday(phone(current), (d) => d.missedCalls - d.missedAndForwardedCalls);
  const weekdays: LeadWeekday[] = DAYS.map((day, i) => ({ day, leads: leadDays[i], calls: callDays[i], missedCalls: missedDays[i] }));

  const source: LeadFunnelFacts["source"] = counted.includes("lead_dashboard") ? "lead_dashboard" : counted.includes("ghl") ? "ghl" : null;
  return {
    source,
    sources: counted.map((key) => LEAD_SOURCES.find((s) => s.key === key)!.label),
    metrics,
    channels,
    weekdays,
  };
}
