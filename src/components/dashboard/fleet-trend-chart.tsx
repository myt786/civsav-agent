"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
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
      <div className="mb-0.5 font-mono text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-medium tabular-nums text-foreground">{format(payload[0].value)}</div>
    </div>
  );
}

// The dashboard's one visual (not tabular) read of the fleet: a 30-day
// area chart with a gradient fill, animated in on mount — everything else
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

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</span>
      {hasSignal ? (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <Tooltip content={<TooltipContentInner format={format} />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              connectNulls={false}
              isAnimationActive
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[140px] items-center justify-center text-xs text-muted-foreground/70">
          Not enough synced days yet
        </div>
      )}
    </div>
  );
}
