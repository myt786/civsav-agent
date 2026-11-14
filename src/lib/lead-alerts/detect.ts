// Lead alerts (lib/lead-alerts): spots when a client's leads stop or fall
// sharply, judged against that client's own normal — a client that gets
// ten leads a day is "stopped" after one empty day, one that gets a lead a
// week isn't until weeks have passed. Pure: the caller builds each daily
// series from stored snapshots (series.ts) and handles state and
// notifications (run.ts).

export type LeadAlertKind = "stopped" | "drop" | "source_stopped" | "data_missing";
export type LeadAlertSensitivity = "low" | "normal" | "high";
export type LeadAlertSeverity = "critical" | "warning";

export interface DayValue {
  date: string; // yyyy-MM-dd, client's own timezone
  // null: no usable number that day (not synced, or unreadable) — never
  // treated as zero.
  value: number | null;
}

export interface LeadSeries {
  // "total" or a lead source key.
  source: string;
  label: string;
  // Full days, oldest first, ending yesterday, starting from the first day
  // this source had data.
  days: DayValue[];
  // Set when the source isn't syncing: its zeros can't be trusted.
  dataProblem: string | null;
}

// Today so far (the afternoon check): leads counted since midnight and
// the share of the day that has passed.
export interface TodaySoFar {
  value: number;
  fraction: number;
}

export interface LeadFinding {
  kind: LeadAlertKind;
  source: string;
  severity: LeadAlertSeverity;
  message: string;
  detail: {
    avgDaily?: number;
    emptyDays?: number;
    expected?: number;
    actual?: number;
    lastLeadDate?: string | null;
    reason?: string;
  };
}

const SETTINGS: Record<LeadAlertSensitivity, { stopScore: number; dropRatio: number; minExpected: number }> = {
  // stopScore: leads a normal client would have brought in over the empty
  // stretch (weekday by weekday) before it counts as stopped. The odds of
  // a healthy client having none are e^-score: low ≈ 0.01%, normal ≈ 0.1%,
  // high ≈ 1%. Tuned to stay quiet: an alert should almost always be real.
  low: { stopScore: 9.2, dropRatio: 0.2, minExpected: 15 },
  normal: { stopScore: 6.9, dropRatio: 0.3, minExpected: 10 },
  high: { stopScore: 4.6, dropRatio: 0.45, minExpected: 6 },
};

// Below these, "normal" is a guess, and a guess makes noise.
const MIN_BASELINE_DAYS = 21;
const MIN_BASELINE_LEADS = 20;
const MIN_AVG_DAILY = 0.5;
const BASELINE_DAYS = 56;
const DROP_RECENT_DAYS = 3;
const DROP_BASELINE_DAYS = 28;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function perDay(n: number): string {
  if (n >= 1) return `about ${Math.round(n)} a day`;
  const perWeek = n * 7;
  return perWeek >= 1 ? `about ${Math.round(perWeek)} a week` : "a few a month";
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function lastLeadDate(days: DayValue[]): string | null {
  for (let i = days.length - 1; i >= 0; i--) if ((days[i].value ?? 0) > 0) return days[i].date;
  return null;
}

// What each weekday normally brings, from known days. A weekday seen
// fewer than twice falls back to the overall daily average.
export function weekdayNorms(days: DayValue[]): { avgDaily: number; byWeekday: number[]; known: number; total: number } {
  const sums = Array.from({ length: 7 }, () => 0);
  const counts = Array.from({ length: 7 }, () => 0);
  let total = 0;
  let known = 0;
  for (const d of days) {
    if (d.value === null) continue;
    const wd = weekday(d.date);
    sums[wd] += d.value;
    counts[wd] += 1;
    total += d.value;
    known += 1;
  }
  const avgDaily = known > 0 ? total / known : 0;
  return { avgDaily, byWeekday: sums.map((sum, wd) => (counts[wd] >= 2 ? sum / counts[wd] : avgDaily)), known, total };
}

// Trailing empty days (unknown days skipped: they neither count nor break
// the run), and the days before them that make up "normal".
function splitStreak(days: DayValue[]): { empty: DayValue[]; baseline: DayValue[] } {
  let i = days.length - 1;
  const empty: DayValue[] = [];
  while (i >= 0 && (days[i].value === null || days[i].value === 0)) {
    if (days[i].value === 0) empty.unshift(days[i]);
    i -= 1;
  }
  return { empty, baseline: days.slice(Math.max(0, i + 1 - BASELINE_DAYS), i + 1) };
}

// Stopped: the empty stretch should, by this client's own weekday pattern,
// have brought in enough leads that having none can't be chance. Days
// that are normally empty (weekends for many clients) add almost nothing.
// Today so far only counts when yesterday was empty too, so the afternoon
// check catches day two of an outage, not a slow morning.
export function checkStopped(
  series: LeadSeries,
  sensitivity: LeadAlertSensitivity,
  today?: TodaySoFar | null,
  todayDate?: string,
): { avgDaily: number; emptyDays: number; expected: number } | null {
  if (today && today.value > 0) return null;
  const { empty, baseline } = splitStreak(series.days);
  const norms = weekdayNorms(baseline);
  if (norms.known < MIN_BASELINE_DAYS || norms.total < MIN_BASELINE_LEADS || norms.avgDaily < MIN_AVG_DAILY) return null;
  if (empty.length === 0) return null;
  let expected = empty.reduce((sum, d) => sum + norms.byWeekday[weekday(d.date)], 0);
  let emptyDays = empty.length;
  if (today && todayDate) {
    expected += today.fraction * norms.byWeekday[weekday(todayDate)];
    emptyDays += today.fraction;
  }
  if (expected < SETTINGS[sensitivity].stopScore) return null;
  return { avgDaily: norms.avgDaily, emptyDays, expected };
}

// Leads are back once a full day brings at least half of what that
// weekday normally does — one stray lead doesn't close an outage.
export function isRecovered(series: LeadSeries, today?: TodaySoFar | null, todayDate?: string): boolean {
  const norms = weekdayNorms(series.days.slice(-(BASELINE_DAYS + 7), -1));
  const last = series.days[series.days.length - 1];
  const need = (date: string, fraction = 1) => Math.max(1, Math.ceil(0.5 * fraction * norms.byWeekday[weekday(date)]));
  if (last && last.value !== null && last.value >= need(last.date)) return true;
  if (today && todayDate && today.value >= need(todayDate, today.fraction)) return true;
  return false;
}

// Last 3 full days against what those weekdays usually bring.
export function checkDrop(series: LeadSeries, sensitivity: LeadAlertSensitivity): { expected: number; actual: number } | null {
  const days = series.days;
  if (days.length < DROP_RECENT_DAYS + 21) return null;
  const recent = days.slice(-DROP_RECENT_DAYS);
  if (recent.some((d) => d.value === null)) return null;
  const base = days.slice(-(DROP_RECENT_DAYS + DROP_BASELINE_DAYS), -DROP_RECENT_DAYS);
  const byWeekday = new Map<number, number[]>();
  for (const d of base) {
    if (d.value === null) continue;
    const wd = weekday(d.date);
    byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), d.value]);
  }
  let expected = 0;
  for (const d of recent) {
    const values = byWeekday.get(weekday(d.date)) ?? [];
    if (values.length < 2) return null;
    expected += values.reduce((a, b) => a + b, 0) / values.length;
  }
  const actual = recent.reduce((a, d) => a + (d.value ?? 0), 0);
  const { dropRatio, minExpected } = SETTINGS[sensitivity];
  if (expected < minExpected || actual > expected * dropRatio) return null;
  return { expected, actual };
}

function emptyText(emptyDays: number): string {
  const full = Math.floor(emptyDays);
  const partial = emptyDays - full > 0;
  if (full === 0) return "none so far today";
  return `none for ${full} day${full === 1 ? "" : "s"}${partial ? " and none so far today" : ""}`;
}

export function detectLeadAlerts(input: {
  total: LeadSeries;
  sources: LeadSeries[];
  sensitivity: LeadAlertSensitivity;
  today?: TodaySoFar | null;
  todayBySource?: Record<string, TodaySoFar>;
  // The client's own date today (yyyy-MM-dd), for its weekday.
  todayDate?: string;
}): LeadFinding[] {
  const { total, sources, sensitivity } = input;
  const findings: LeadFinding[] = [];

  for (const s of sources) {
    if (!s.dataProblem) continue;
    findings.push({
      kind: "data_missing",
      source: s.source,
      severity: "warning",
      message: `${s.label}: can't see leads right now — ${s.dataProblem}`,
      detail: { reason: s.dataProblem, lastLeadDate: lastLeadDate(s.days) },
    });
  }

  const stopped = checkStopped(total, sensitivity, input.today, input.todayDate);
  if (stopped) {
    findings.push({
      kind: "stopped",
      source: "total",
      severity: "critical",
      message: `Leads have stopped: ${emptyText(stopped.emptyDays)} (usually ${perDay(stopped.avgDaily)})`,
      detail: { avgDaily: round1(stopped.avgDaily), emptyDays: round1(stopped.emptyDays), expected: round1(stopped.expected), lastLeadDate: lastLeadDate(total.days) },
    });
  } else {
    const drop = checkDrop(total, sensitivity);
    if (drop) {
      findings.push({
        kind: "drop",
        source: "total",
        severity: "warning",
        message: `Leads are well below normal: ${drop.actual} in the last 3 days, usually about ${Math.round(drop.expected)}`,
        detail: { expected: round1(drop.expected), actual: drop.actual, lastLeadDate: lastLeadDate(total.days) },
      });
    }
  }

  // One source going quiet while others carry on usually means a broken
  // form, tracking or integration. Skipped when everything has stopped
  // (that alert already covers it) and when the source isn't syncing.
  if (!stopped) {
    for (const s of sources) {
      if (s.dataProblem) continue;
      const hit = checkStopped(s, sensitivity, input.todayBySource?.[s.source] ?? null, input.todayDate);
      if (!hit) continue;
      findings.push({
        kind: "source_stopped",
        source: s.source,
        severity: "critical",
        message: `${s.label} has stopped: ${emptyText(hit.emptyDays)} (usually ${perDay(hit.avgDaily)}) — other sources are still bringing leads`,
        detail: { avgDaily: round1(hit.avgDaily), emptyDays: round1(hit.emptyDays), expected: round1(hit.expected), lastLeadDate: lastLeadDate(s.days) },
      });
    }
  }

  return findings;
}

export function isSensitivity(value: unknown): value is LeadAlertSensitivity {
  return value === "low" || value === "normal" || value === "high";
}
