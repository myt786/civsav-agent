"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DailyPoint } from "@/lib/dashboard/types";

interface Series {
  label: string;
  points: DailyPoint[];
  stroke: string;
}

function TooltipContentInner({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-none">
      <div className="mb-0.5 font-mono text-muted-foreground">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-1.5 font-mono tabular-nums" style={{ color: entry.color }}>
          <span>{entry.name}:</span>
          <span>{formatValue(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// A quiet 30-day line, one small multiple per metric. Gaps (null points)
// are left as gaps rather than interpolated — a day with no data is not
// visually the same as a day with a real zero.
export function Sparkline({ series, formatValue }: { series: Series[]; formatValue: (v: number) => string }) {
  const length = series[0]?.points.length ?? 0;
  const data = Array.from({ length }, (_, i) => {
    const row: Record<string, string | number | null> = { date: series[0]?.points[i]?.date ?? "" };
    for (const s of series) {
      row[s.label] = s.points[i]?.value ?? null;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={56}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <Tooltip
          content={<TooltipContentInner formatValue={formatValue} />}
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
        />
        {series.map((s) => (
          <Line
            key={s.label}
            type="monotone"
            dataKey={s.label}
            stroke={s.stroke}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
