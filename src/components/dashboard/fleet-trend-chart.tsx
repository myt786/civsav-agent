"use client";

import { format as formatDate, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatInteger } from "@/lib/dashboard/format";
import type { DailyPoint } from "@/lib/dashboard/types";

// Passed as a kind string, not a function — this is a client component fed
// by a server page, and a raw function reference can't cross that boundary.
type FormatKind = "integer" | "currency";
const FORMATTERS: Record<FormatKind, (n: number) => string> = {
  integer: formatInteger,
  currency: formatCurrency,
};

function TooltipContentInner({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-0.5 text-muted-foreground">{label ? formatDate(parseISO(label), "EEE d MMM") : null}</div>
      <div className="font-mono text-sm font-medium tabular-nums text-foreground">{format(payload[0].value)}</div>
    </div>
  );
}

// The dashboard's one visual (not tabular) read of the fleet: a 30-day
// area chart with a gradient fill — everything else
// on this page is precise per-client numbers, this is the "shape" glance
// that goes with them. See buildFleetDailySeries for how days combine.
export function FleetTrendChart({
  title,
  points,
  color,
  formatKind,
}: {
  title: string;
  points: DailyPoint[];
  color: string;
  formatKind: FormatKind;
}) {
  const format = FORMATTERS[formatKind];
  const gradientId = `fleet-trend-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const data = points.map((p) => ({ date: p.date, value: p.value }));
  const hasSignal = data.some((d) => d.value !== null);
  const known = data.filter((d): d is { date: string; value: number } => d.value !== null);
  const total = known.reduce((sum, d) => sum + d.value, 0);
  const average = known.length > 0 ? total / known.length : null;
  // Spend in particular can start partway through the window (an account
  // connected recently) — say so rather than leave a mysterious blank.
  const firstKnownIndex = data.findIndex((d) => d.value !== null);
  const lateStart = firstKnownIndex > 3 ? data[firstKnownIndex].date : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card shadow-sm p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</span>
        {average !== null && (
          <span className="flex items-baseline gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">{format(total)}</span> total
            </span>
            <span>
              <span className="font-mono text-sm font-medium tabular-nums text-foreground">{format(average)}</span> a day
            </span>
          </span>
        )}
      </div>
      {hasSignal ? (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => formatDate(parseISO(d), "d MMM")}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              width={44}
              tickFormatter={(v: number) => format(v)}
              tickLine={false}
              axisLine={false}
              tickCount={3}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <Tooltip content={<TooltipContentInner format={format} />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              connectNulls={false}
              // Off: recharts' draw-in animation runs on requestAnimationFrame,
              // which is paused in background tabs — the chart stayed an empty
              // box until the tab was focused.
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground/70">
          Not enough days of data yet
        </div>
      )}
      {lateStart && (
        <span className="text-xs text-muted-foreground">
          Nothing recorded before {formatDate(parseISO(lateStart), "d MMM")}.
        </span>
      )}
    </div>
  );
}
