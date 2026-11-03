import { endOfMonth, format, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { LeadReportKind } from "./types";

const KEY = "yyyy-MM-dd";

export interface LeadPeriod {
  start: string;
  end: string;
  label: string;
}

// Weekly: last Monday–Sunday. Monthly: last calendar month. On demand: the
// last `days` days up to yesterday. All in the client's own timezone.
export function leadPeriodFor(kind: LeadReportKind, now: Date, timezone: string, days = 30): LeadPeriod {
  const today = toZonedTime(now, timezone);
  if (kind === "monthly") {
    const lastMonth = subMonths(today, 1);
    return { start: format(startOfMonth(lastMonth), KEY), end: format(endOfMonth(lastMonth), KEY), label: format(lastMonth, "MMMM yyyy") };
  }
  if (kind === "weekly") {
    const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
    const start = subDays(thisMonday, 7);
    const end = subDays(thisMonday, 1);
    return { start: format(start, KEY), end: format(end, KEY), label: `Week of ${format(start, "d MMM yyyy")}` };
  }
  const end = subDays(today, 1);
  const start = subDays(end, Math.max(1, days) - 1);
  return { start: format(start, KEY), end: format(end, KEY), label: `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}` };
}
