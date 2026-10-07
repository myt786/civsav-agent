import { addDays, format, parseISO, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { leadDashboardDataSchema } from "../connectors/lead-dashboard/schema";
import { ghlDataSchema } from "../connectors/ghl/schema";
import { telephonyDataSchema } from "../connectors/openphone/schema";
import { googleAdsDataSchema } from "../connectors/google-ads/schema";
import { metaDataSchema } from "../connectors/meta/schema";
import { ga4DataSchema } from "../connectors/ga4/schema";
import { searchConsoleDataSchema } from "../connectors/search-console/schema";
import { seoDataSchema } from "../connectors/ahrefs/schema";
import { PLATFORM_LABELS } from "../connectors/platform-labels";
import type { Platform } from "../connectors/types";
import type { AnalysisKind, MetricFact, PlatformFacts } from "./types";

// Everything here is plain arithmetic over the daily snapshots the sync
// already stores — no API calls and no AI. The model is only ever shown
// the results, so every number in a report can be traced back to here.

export interface SnapshotLike {
  date: string;
  metrics: unknown;
}

export interface Period {
  start: string;
  end: string;
}

const KEY = "yyyy-MM-dd";
const WEEKS = 13;

// on_demand: the last 30 full days (ending yesterday, in the client's own
// timezone) against the 30 before. monthly: the last full calendar month
// against the month before it.
export function periodsFor(
  kind: AnalysisKind,
  now: Date,
  timezone: string,
): { current: Period & { label: string }; previous: Period } {
  const today = toZonedTime(now, timezone);
  if (kind === "monthly") {
    const lastMonth = subMonths(today, 1);
    const monthBefore = subMonths(today, 2);
    return {
      current: {
        start: format(startOfMonth(lastMonth), KEY),
        end: format(endOfMonth(lastMonth), KEY),
        label: format(lastMonth, "MMMM yyyy"),
      },
      previous: { start: format(startOfMonth(monthBefore), KEY), end: format(endOfMonth(monthBefore), KEY) },
    };
  }
  const end = subDays(today, 1);
  const start = subDays(end, 29);
  return {
    current: { start: format(start, KEY), end: format(end, KEY), label: `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}` },
    previous: { start: format(subDays(start, 30), KEY), end: format(subDays(start, 1), KEY) },
  };
}

function inPeriod(row: SnapshotLike, period: Period): boolean {
  return row.date >= period.start && row.date <= period.end;
}

// Structural, like safeExtract in dashboard/queries.ts, so each schema's
// own output type flows through.
type Schema<T> = { safeParse: (value: unknown) => { success: boolean; data?: T } };

function parsed<T>(rows: SnapshotLike[], schema: Schema<T>, period: Period): T[] {
  const out: T[] = [];
  for (const row of rows) {
    if (!inPeriod(row, period)) continue;
    const result = schema.safeParse(row.metrics);
    if (result.success && result.data !== undefined) out.push(result.data);
  }
  return out;
}

function sum<T>(items: T[], pick: (item: T) => number): number | null {
  return items.length === 0 ? null : items.reduce((total, item) => total + pick(item), 0);
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator;
}

export function changeOf(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

function metric(
  label: string,
  unit: MetricFact["unit"],
  current: number | null,
  previous: number | null,
  lowerIsBetter = false,
): MetricFact {
  return { label, unit, current, previous, change: changeOf(current, previous), ...(lowerIsBetter ? { lowerIsBetter } : {}) };
}

// Weekly totals of one value, the last WEEKS weeks ending on `end`.
function weeklyTotals<T>(rows: SnapshotLike[], schema: Schema<T>, end: string, pick: (item: T) => number): (number | null)[] {
  const endDate = parseISO(end);
  const values: (number | null)[] = [];
  for (let w = WEEKS - 1; w >= 0; w--) {
    const weekEnd = subDays(endDate, w * 7);
    const week = { start: format(subDays(weekEnd, 6), KEY), end: format(weekEnd, KEY) };
    values.push(sum(parsed(rows, schema, week), pick));
  }
  return values;
}

function topEntries(map: Map<string, number>, n: number): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function base(platform: Platform, current: number, previous: number): Omit<PlatformFacts, "metrics" | "notes" | "weekly"> {
  return { platform, label: PLATFORM_LABELS[platform], daysWithData: current, previousDaysWithData: previous, problem: null };
}

export function buildPlatformFacts(platform: Platform, rows: SnapshotLike[], current: Period, previous: Period): PlatformFacts {
  switch (platform) {
    case "lead_dashboard": {
      const cur = parsed(rows, leadDashboardDataSchema, current);
      const prev = parsed(rows, leadDashboardDataSchema, previous);
      return {
        ...base(platform, cur.length, prev.length),
        metrics: [
          metric("Leads", "count", sum(cur, (d) => d.totalLeads), sum(prev, (d) => d.totalLeads)),
          metric("Spam leads", "count", sum(cur, (d) => d.spamLeads), sum(prev, (d) => d.spamLeads), true),
        ],
        notes: [],
        weekly: { label: "Leads per week", values: weeklyTotals(rows, leadDashboardDataSchema, current.end, (d) => d.totalLeads) },
      };
    }
    case "ghl": {
      const cur = parsed(rows, ghlDataSchema, current);
      const prev = parsed(rows, ghlDataSchema, previous);
      return {
        ...base(platform, cur.length, prev.length),
        metrics: [
          metric("New opportunities", "count", sum(cur, (d) => d.leadCount), sum(prev, (d) => d.leadCount)),
          metric("Opportunity value", "currency", sum(cur, (d) => d.opportunityValue), sum(prev, (d) => d.opportunityValue)),
        ],
        notes: [],
        weekly: { label: "Opportunities per week", values: weeklyTotals(rows, ghlDataSchema, current.end, (d) => d.leadCount) },
      };
    }
    case "openphone": {
      const cur = parsed(rows, telephonyDataSchema, current);
      const prev = parsed(rows, telephonyDataSchema, previous);
      const missed = (items: typeof cur) => sum(items, (d) => d.missedCalls - d.missedAndForwardedCalls);
      const calls = (items: typeof cur) => sum(items, (d) => d.totalCalls);
      const rate = (items: typeof cur) => {
        const r = ratio(missed(items), calls(items));
        return r === null ? null : r * 100;
      };
      const avgMinutes = (items: typeof cur) => {
        const r = ratio(sum(items, (d) => d.totalDurationSeconds), calls(items));
        return r === null ? null : r / 60;
      };
      return {
        ...base(platform, cur.length, prev.length),
        metrics: [
          metric("Calls", "count", calls(cur), calls(prev)),
          metric("Missed calls", "count", missed(cur), missed(prev), true),
          metric("Missed-call rate", "percent", rate(cur), rate(prev), true),
          metric("Average call length (minutes)", "number", avgMinutes(cur), avgMinutes(prev)),
        ],
        notes: [],
        weekly: { label: "Calls per week", values: weeklyTotals(rows, telephonyDataSchema, current.end, (d) => d.totalCalls) },
      };
    }
    case "google_ads": {
      const cur = parsed(rows, googleAdsDataSchema, current);
      const prev = parsed(rows, googleAdsDataSchema, previous);
      const spend = (i: typeof cur) => sum(i, (d) => d.cost);
      const clicks = (i: typeof cur) => sum(i, (d) => d.clicks);
      const impressions = (i: typeof cur) => sum(i, (d) => d.impressions);
      const conversions = (i: typeof cur) => sum(i, (d) => d.conversions);
      const ctr = (i: typeof cur) => {
        const r = ratio(clicks(i), impressions(i));
        return r === null ? null : r * 100;
      };
      return {
        ...base(platform, cur.length, prev.length),
        metrics: [
          metric("Spend", "currency", spend(cur), spend(prev)),
          metric("Impressions", "count", impressions(cur), impressions(prev)),
          metric("Clicks", "count", clicks(cur), clicks(prev)),
          metric("Click-through rate", "percent", ctr(cur), ctr(prev)),
          metric("Cost per click", "currency", ratio(spend(cur), clicks(cur)), ratio(spend(prev), clicks(prev)), true),
          metric("Conversions", "number", conversions(cur), conversions(prev)),
          metric("Cost per conversion", "currency", ratio(spend(cur), conversions(cur)), ratio(spend(prev), conversions(prev)), true),
        ],
        notes: [],
        weekly: { label: "Spend per week", values: weeklyTotals(rows, googleAdsDataSchema, current.end, (d) => d.cost) },
      };
    }
    case "meta": {
      const cur = parsed(rows, metaDataSchema, current);
      const prev = parsed(rows, metaDataSchema, previous);
      const spend = (i: typeof cur) => sum(i, (d) => d.spend);
      const clicks = (i: typeof cur) => sum(i, (d) => d.clicks);
      const impressions = (i: typeof cur) => sum(i, (d) => d.impressions);
      const results = (i: typeof cur) => sum(i, (d) => d.results);
      const ctr = (i: typeof cur) => {
        const r = ratio(clicks(i), impressions(i));
        return r === null ? null : r * 100;
      };
      return {
        ...base(platform, cur.length, prev.length),
        metrics: [
          metric("Spend", "currency", spend(cur), spend(prev)),
          metric("Impressions", "count", impressions(cur), impressions(prev)),
          metric("Clicks", "count", clicks(cur), clicks(prev)),
          metric("Click-through rate", "percent", ctr(cur), ctr(prev)),
          metric("Results (leads)", "count", results(cur), results(prev)),
          metric("Cost per result", "currency", ratio(spend(cur), results(cur)), ratio(spend(prev), results(prev)), true),
        ],
        notes: [],
        weekly: { label: "Spend per week", values: weeklyTotals(rows, metaDataSchema, current.end, (d) => d.spend) },
      };
    }
    case "ga4": {
      const cur = parsed(rows, ga4DataSchema, current);
      const prev = parsed(rows, ga4DataSchema, previous);
      const sources = (items: typeof cur) => {
        const map = new Map<string, number>();
        for (const day of items) for (const s of day.trafficSources) map.set(s.source, (map.get(s.source) ?? 0) + s.sessions);
        return map;
      };
      const curSources = sources(cur);
      const prevSources = sources(prev);
      const events = new Map<string, number>();
      for (const day of cur) for (const e of day.conversionEvents) events.set(e.eventName, (events.get(e.eventName) ?? 0) + e.conversions);
      const notes: string[] = [];
      const top = topEntries(curSources, 5);
      if (top.length > 0) {
        notes.push(
          `Top traffic sources this period: ${top
            .map(([source, sessions]) => {
              const before = prevSources.get(source);
              const c = changeOf(sessions, before ?? null);
              return `${source} ${Math.round(sessions)} sessions${c === null ? "" : ` (${c >= 0 ? "+" : ""}${Math.round(c * 100)}%)`}`;
            })
            .join("; ")}.`,
        );
      }
      const topEvents = topEntries(events, 4);
      if (topEvents.length > 0) {
        notes.push(`Conversions by event: ${topEvents.map(([name, n]) => `${name} ${Math.round(n)}`).join("; ")} (GA4 may count phone-number taps as conversions).`);
      }
      return {
        ...base(platform, cur.length, prev.length),
        metrics: [
          metric("Sessions", "count", sum(cur, (d) => d.totalSessions), sum(prev, (d) => d.totalSessions)),
          metric("Conversions", "count", sum(cur, (d) => d.totalConversions), sum(prev, (d) => d.totalConversions)),
        ],
        notes,
        weekly: { label: "Sessions per week", values: weeklyTotals(rows, ga4DataSchema, current.end, (d) => d.totalSessions) },
      };
    }
    case "search_console": {
      const cur = parsed(rows, searchConsoleDataSchema, current);
      const prev = parsed(rows, searchConsoleDataSchema, previous);
      const clicks = (i: typeof cur) => sum(i, (d) => d.totalClicks);
      const impressions = (i: typeof cur) => sum(i, (d) => d.totalImpressions);
      const position = (i: typeof cur) => ratio(sum(i, (d) => d.averagePosition * d.totalImpressions), impressions(i));
      const ctr = (i: typeof cur) => {
        const r = ratio(clicks(i), impressions(i));
        return r === null ? null : r * 100;
      };
      const queryClicks = (items: typeof cur) => {
        const map = new Map<string, number>();
        for (const day of items) for (const q of day.topQueries) map.set(q.query, (map.get(q.query) ?? 0) + q.clicks);
        return map;
      };
      const curQ = queryClicks(cur);
      const prevQ = queryClicks(prev);
      const deltas = [...new Set([...curQ.keys(), ...prevQ.keys()])].map(
        (q) => [q, (curQ.get(q) ?? 0) - (prevQ.get(q) ?? 0)] as [string, number],
      );
      const gained = deltas.filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const lost = deltas.filter(([, d]) => d < 0).sort((a, b) => a[1] - b[1]).slice(0, 5);
      const notes: string[] = [];
      const topNow = topEntries(curQ, 5);
      if (topNow.length > 0) notes.push(`Top search queries by clicks: ${topNow.map(([q, c]) => `"${q}" ${Math.round(c)}`).join("; ")}.`);
      if (gained.length > 0) notes.push(`Queries gaining clicks: ${gained.map(([q, d]) => `"${q}" +${Math.round(d)}`).join("; ")}.`);
      if (lost.length > 0) notes.push(`Queries losing clicks: ${lost.map(([q, d]) => `"${q}" ${Math.round(d)}`).join("; ")}.`);
      return {
        ...base(platform, cur.length, prev.length),
        metrics: [
          metric("Clicks from Google search", "count", clicks(cur), clicks(prev)),
          metric("Impressions", "count", impressions(cur), impressions(prev)),
          metric("Click-through rate", "percent", ctr(cur), ctr(prev)),
          metric("Average position", "position", position(cur), position(prev), true),
        ],
        notes,
        weekly: { label: "Search clicks per week", values: weeklyTotals(rows, searchConsoleDataSchema, current.end, (d) => d.totalClicks) },
      };
    }
    case "ahrefs": {
      // Synced monthly: the latest snapshot on or before each period's end.
      const latest = (end: string) => {
        const candidates = rows.filter((r) => r.date <= end).sort((a, b) => b.date.localeCompare(a.date));
        for (const row of candidates) {
          const result = seoDataSchema.safeParse(row.metrics);
          if (result.success) return { date: row.date, data: result.data };
        }
        return null;
      };
      const cur = latest(current.end);
      const prevRaw = latest(previous.end);
      const prev = prevRaw && cur && prevRaw.date === cur.date ? null : prevRaw;
      const notes: string[] = [];
      if (cur) {
        notes.push(`Ahrefs numbers are from ${cur.date}. Keywords gained that month: ${cur.data.keywordsGained}, lost: ${cur.data.keywordsLost}.`);
        if (cur.data.newReferringDomains !== null) notes.push(`New referring domains that month: ${cur.data.newReferringDomains}.`);
      }
      return {
        ...base(platform, cur ? 1 : 0, prev ? 1 : 0),
        metrics: [
          metric("Organic keywords", "count", cur?.data.organicKeywords ?? null, prev?.data.organicKeywords ?? null),
          metric("Keywords in top 3", "count", cur?.data.organicKeywordsTop3 ?? null, prev?.data.organicKeywordsTop3 ?? null),
          metric("Estimated organic traffic", "count", cur?.data.organicTrafficEstimate ?? null, prev?.data.organicTrafficEstimate ?? null),
          metric("Referring domains", "count", cur?.data.referringDomains ?? null, prev?.data.referringDomains ?? null),
        ],
        notes,
        weekly: null,
      };
    }
  }
}

// Helper for tests and the email: the end date of the last week bucket.
export function weekLabels(end: string): string[] {
  const endDate = parseISO(end);
  const labels: string[] = [];
  for (let w = WEEKS - 1; w >= 0; w--) labels.push(format(addDays(subDays(endDate, w * 7), -6), "d MMM"));
  return labels;
}
