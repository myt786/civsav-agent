"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatCurrency,
  formatInteger,
  formatPosition,
} from "@/lib/dashboard/format";
import type { DailyPoint } from "@/lib/dashboard/types";

export function FleetTrendChart({
  title,
  points,
  color,
  formatKind,
}: {
  title: string;
  points: DailyPoint[];
  color: string;
  formatKind: "integer" | "currency" | "position";
}) {
  const format =
    formatKind === "currency"
      ? formatCurrency
      : formatKind === "position"
        ? formatPosition
        : formatInteger;
  const hasData = points.some((p) => p.value !== null);
  return (
    <div role="group" aria-label={`${title}, daily trend`}>
      {hasData ? (
        <div className="h-[210px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              accessibilityLayer
              data={points}
              margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 4"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => String(v).slice(5).replace("-", "/")}
                axisLine={false}
                tickLine={false}
                minTickGap={45}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                width={45}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) =>
                  Number(v) >= 1000
                    ? `${(Number(v) / 1000).toFixed(0)}k`
                    : String(v)
                }
              />
              <Tooltip
                formatter={(v) => [
                  typeof v === "number" ? format(v) : "No data",
                  title,
                ]}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "var(--border)",
                  fontSize: 12,
                }}
              />
              <Area
                name={title}
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={color}
                fillOpacity={0.055}
                strokeWidth={2}
                dot={{ r: 1.5, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground">
          No synced data for this period
        </div>
      )}
      {hasData && (
        <details className="mt-2 text-[11px] text-muted-foreground">
          <summary>View daily values</summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <table className="w-full text-left">
              <caption className="sr-only">{title} daily values</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">{title}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date}>
                    <td className="py-1">{p.date}</td>
                    <td>{p.value === null ? "No data" : format(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
