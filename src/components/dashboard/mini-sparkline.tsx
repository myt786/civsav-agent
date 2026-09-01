"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";
import type { DailyPoint } from "@/lib/dashboard/types";

// A tiny, tooltip-free trend line for inline table use — the number next
// to it is still the source of truth; this only adds the shape a raw
// figure can't show (a client that hit 122 leads by one Tuesday spike
// reads very differently than one that got there steadily).
export function MiniSparkline({ points, stroke = "var(--chart-1)" }: { points: DailyPoint[]; stroke?: string }) {
  const hasSignal = points.some((p, i) => i > 0 && p.value !== null && points[i - 1].value !== null);
  if (!hasSignal) return <div className="h-6 w-14 shrink-0" aria-hidden />;

  const data = points.map((p) => ({ date: p.date, value: p.value }));
  return (
    <div className="h-6 w-14 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}>
          <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
