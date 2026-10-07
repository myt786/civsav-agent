import { getDay, parseISO } from "date-fns";
import { leadDashboardDataSchema } from "../connectors/lead-dashboard/schema";
import { ghlDataSchema } from "../connectors/ghl/schema";
import { telephonyDataSchema } from "../connectors/openphone/schema";
import { googleAdsDataSchema } from "../connectors/google-ads/schema";
import { metaDataSchema } from "../connectors/meta/schema";
import { ga4DataSchema } from "../connectors/ga4/schema";
import { searchConsoleDataSchema } from "../connectors/search-console/schema";
import type { Platform } from "../connectors/types";
import { changeOf, type Period, type SnapshotLike } from "./facts";
import type { LeadChannel, LeadFunnelFacts, LeadWeekday, MetricFact } from "./types";

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

export function buildLeadFunnel(
  rowsByPlatform: Map<Platform, SnapshotLike[]>,
  connected: Platform[],
  current: Period,
  previous: Period,
): LeadFunnelFacts | null {
  const has = (p: Platform) => connected.includes(p);
  const source: LeadFunnelFacts["source"] = has("lead_dashboard") ? "lead_dashboard" : has("ghl") ? "ghl" : null;

  const ld = (period: Period) => parsedRows(rowsByPlatform.get("lead_dashboard"), leadDashboardDataSchema, period);
  const ghl = (period: Period) => parsedRows(rowsByPlatform.get("ghl"), ghlDataSchema, period);
  const phone = (period: Period) => parsedRows(rowsByPlatform.get("openphone"), telephonyDataSchema, period);
  const gads = (period: Period) => parsedRows(rowsByPlatform.get("google_ads"), googleAdsDataSchema, period);
  const meta = (period: Period) => parsedRows(rowsByPlatform.get("meta"), metaDataSchema, period);
  const ga4 = (period: Period) => parsedRows(rowsByPlatform.get("ga4"), ga4DataSchema, period);
  const gsc = (period: Period) => parsedRows(rowsByPlatform.get("search_console"), searchConsoleDataSchema, period);

  const leads = (period: Period) =>
    source === "lead_dashboard" ? total(ld(period), (d) => d.totalLeads) : source === "ghl" ? total(ghl(period), (d) => d.leadCount) : null;
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
  if (source) metrics.push(fact("Leads", "count", leads(current), leads(previous)));
  if (has("lead_dashboard")) {
    metrics.push(fact("Completed leads", "count", completed(current), completed(previous)));
    metrics.push(fact("Abandoned (unfinished) leads", "count", abandoned(current), abandoned(previous), true));
    metrics.push(fact("Completion rate", "percent", pct(completed(current), leads(current)), pct(completed(previous), leads(previous))));
    metrics.push(fact("Spam leads", "count", spam(current), spam(previous), true));
    metrics.push(fact("Spam rate", "percent", pct(spam(current), leads(current)), pct(spam(previous), leads(previous)), true));
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
    if (source) metrics.push(fact("Blended cost per lead", "currency", cpl(current), cpl(previous), true));
  }
  if (metrics.length === 0) return null;

  // Where leads come from: each channel's own count, side by side.
  const channels: LeadChannel[] = [];
  if (has("google_ads")) channels.push(channel("Google Ads conversions", total(gads(current), (d) => d.conversions), total(gads(previous), (d) => d.conversions)));
  if (has("meta")) channels.push(channel("Meta Ads results", total(meta(current), (d) => d.results), total(meta(previous), (d) => d.results)));
  if (has("openphone")) channels.push(channel("Answered phone calls", metrics.find((m) => m.label === "Answered calls")?.current ?? null, metrics.find((m) => m.label === "Answered calls")?.previous ?? null));
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

  const leadDays = source === "lead_dashboard" ? byWeekday(ld(current), (d) => d.totalLeads) : source === "ghl" ? byWeekday(ghl(current), (d) => d.leadCount) : DAYS.map(() => null);
  const callDays = byWeekday(phone(current), (d) => d.totalCalls);
  const missedDays = byWeekday(phone(current), (d) => d.missedCalls - d.missedAndForwardedCalls);
  const weekdays: LeadWeekday[] = DAYS.map((day, i) => ({ day, leads: leadDays[i], calls: callDays[i], missedCalls: missedDays[i] }));

  return { source, metrics, channels, weekdays };
}
