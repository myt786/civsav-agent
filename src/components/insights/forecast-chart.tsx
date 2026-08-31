"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCurrency, formatInteger } from "@/lib/dashboard/format";
import type { MetricForecast } from "@/lib/insights/types";

function unitFormatter(unit: MetricForecast["unit"]) {
  return unit === "currency" ? formatCurrency : formatInteger;
}

interface ChartRow {
  date: string;
  actual: number | null;
  projected: number | null;
}

// Bridges the actual/projected series at the join date so the line reads
// as one continuous trend rather than two disconnected segments.
function toChartRows(metric: MetricForecast): ChartRow[] {
  const actual: ChartRow[] = metric.history.map((p) => ({ date: p.date, actual: p.value, projected: null }));
  const projected: ChartRow[] = metric.forecast.map((p) => ({ date: p.date, actual: null, projected: p.value }));
  const lastActual = [...metric.history].reverse().find((p) => p.value !== null);
  if (lastActual && projected.length > 0) {
    return [
      ...actual.filter((r) => r.date !== lastActual.date),
      { date: lastActual.date, actual: lastActual.value, projected: lastActual.value },
      ...projected,
    ];
  }
  return [...actual, ...projected];
}

function TooltipContentInner({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-none">
      <div className="mb-0.5 font-mono text-muted-foreground">{label}</div>
      <div className="font-mono tabular-nums text-foreground">{format(point.value)}</div>
    </div>
  );
}

const TREND_LABEL: Record<MetricForecast["trend"], string> = {
  up: "trending up",
  down: "trending down",
  flat: "holding flat",
  unknown: "not enough history yet",
};

export function ForecastChart({ clientName, metric }: { clientName: string; metric: MetricForecast }) {
  const rows = toChartRows(metric);
  const hasForecast = metric.forecast.length > 0;
  const format = unitFormatter(metric.unit);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{clientName}</span>
        <span className="text-xs text-muted-foreground">{metric.label} — {TREND_LABEL[metric.trend]}</span>
      </div>
      {hasForecast ? (
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="date" hide />
            <Tooltip content={<TooltipContentInner format={format} />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
            <Line type="monotone" dataKey="actual" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="projected"
              stroke="var(--chart-1)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[90px] items-center justify-center text-xs text-muted-foreground/70">
          Not enough synced days to project a trend
        </div>
      )}
    </div>
  );
}
