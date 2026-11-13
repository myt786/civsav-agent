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
  // stopScore: expected leads in the empty stretch before it counts as
  // stopped. Poisson odds of a normal client having none: e^-score
  // (low ≈ 0.1%, normal ≈ 1%, high ≈ 5%).
  low: { stopScore: 6.9, dropRatio: 0.25, minExpected: 10 },
  normal: { stopScore: 4.6, dropRatio: 0.4, minExpected: 6 },
  high: { stopScore: 3, dropRatio: 0.55, minExpected: 4 },
};

// Below this, a "normal" is a guess.
const MIN_BASELINE_DAYS = 14;
const MIN_BASELINE_LEADS = 10;
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

function lastLeadDate(days: DayValue[]): string | null {
  for (let i = days.length - 1; i >= 0; i--) if ((days[i].value ?? 0) > 0) return days[i].date;
  return null;
}

// Trailing empty days (unknown days skipped, they neither count nor break
// the run), and the days before them that make up "normal".
function splitStreak(days: DayValue[]): { emptyDays: number; baseline: number[] } {
  let i = days.length - 1;
  let emptyDays = 0;
  while (i >= 0 && (days[i].value === null || days[i].value === 0)) {
    if (days[i].value === 0) emptyDays += 1;
    i -= 1;
  }
  const baseline = days
    .slice(Math.max(0, i + 1 - BASELINE_DAYS), i + 1)
    .map((d) => d.value)
    .filter((v): v is number => v !== null);
  return { emptyDays, baseline };
}

export function checkStopped(
  series: LeadSeries,
  sensitivity: LeadAlertSensitivity,
  today?: TodaySoFar | null,
): { avgDaily: number; emptyDays: number } | null {
  if (today && today.value > 0) return null; // leads are coming in today
  const { emptyDays, baseline } = splitStreak(series.days);
  const total = baseline.reduce((a, b) => a + b, 0);
  if (baseline.length < MIN_BASELINE_DAYS || total < MIN_BASELINE_LEADS) return null;
  const avgDaily = total / baseline.length;
  const empty = emptyDays + (today ? today.fraction : 0);
  if (empty <= 0 || avgDaily * empty < SETTINGS[sensitivity].stopScore) return null;
  return { avgDaily, emptyDays: empty };
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
    const wd = new Date(`${d.date}T12:00:00Z`).getUTCDay();
    byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), d.value]);
  }
  let expected = 0;
  for (const d of recent) {
    const values = byWeekday.get(new Date(`${d.date}T12:00:00Z`).getUTCDay()) ?? [];
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

  const stopped = checkStopped(total, sensitivity, input.today);
  if (stopped) {
    findings.push({
      kind: "stopped",
      source: "total",
      severity: "critical",
      message: `Leads have stopped: ${emptyText(stopped.emptyDays)} (usually ${perDay(stopped.avgDaily)})`,
      detail: { avgDaily: round1(stopped.avgDaily), emptyDays: round1(stopped.emptyDays), lastLeadDate: lastLeadDate(total.days) },
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
      const hit = checkStopped(s, sensitivity, input.todayBySource?.[s.source] ?? null);
      if (!hit) continue;
      findings.push({
        kind: "source_stopped",
        source: s.source,
        severity: "critical",
        message: `${s.label} has stopped: ${emptyText(hit.emptyDays)} (usually ${perDay(hit.avgDaily)}) — other sources are still bringing leads`,
        detail: { avgDaily: round1(hit.avgDaily), emptyDays: round1(hit.emptyDays), lastLeadDate: lastLeadDate(s.days) },
      });
    }
  }

  return findings;
}

export function isSensitivity(value: unknown): value is LeadAlertSensitivity {
  return value === "low" || value === "normal" || value === "high";
}
