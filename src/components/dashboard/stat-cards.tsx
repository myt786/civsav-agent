"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatCurrency, formatInteger, formatPercent } from "@/lib/dashboard/format";
import { useCountUp } from "@/lib/use-count-up";
import { cn } from "@/lib/utils";

// formatKind (not a function prop) because these are server components
// building the stats array — a raw function reference can't cross the
// server/client boundary, only serializable data and already-rendered
// elements (icon is a ReactNode for the same reason: rendered server-side,
// not a component reference).
export type StatFormatKind = "integer" | "currency" | "percent";

const FORMATTERS: Record<StatFormatKind, (n: number) => string> = {
  integer: formatInteger,
  currency: formatCurrency,
  // Stat.value carries the already-*100 percentage (e.g. 83.8, not
  // 0.838) — same convention DeltaCell.pct uses.
  percent: formatPercent,
};

export interface Stat {
  label: string;
  value: number | null;
  formatKind: StatFormatKind;
  icon: ReactNode;
  tone?: "default" | "warning";
  href?: string;
  // Week-over-week change in percent (already ×100). Null hides it.
  changePct?: number | null;
  // What the change compares against; defaults to the week before.
  changeLabel?: string;
  // Whether a rise is good news (leads, visits) or neutral (spend) —
  // spend going up isn't "bad", so it's never coloured red or green.
  changeTone?: "up-is-good" | "neutral";
  // One quiet line of context under the number.
  hint?: string;
  // Daily values behind the card, drawn as a soft trend line along the
  // bottom edge.
  trend?: (number | null)[];
  trendColor?: string;
}

// A width-filling SVG sparkline — recharts is overkill for a decorative
// shape with no axes or tooltip. Gaps (null days) break the line.
function CardTrend({ values, color }: { values: (number | null)[]; color: string }) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const span = max - min || 1;
  const w = 100;
  const h = 28;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  // Split into runs of consecutive known days; a null day breaks the line.
  // Each segment is the list of [x, y] points in one unbroken run.
  const segments: [string, string][][] = [[]];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) {
      if (segments[segments.length - 1].length > 0) segments.push([]);
      continue;
    }
    segments[segments.length - 1].push([(i * step).toFixed(2), (h - 2 - ((v - min) / span) * (h - 4)).toFixed(2)]);
  }
  const runs = segments.filter((points) => points.length > 0);
  const gradientId = `card-trend-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {runs.map((points, i) => {
        const line = points.map(([x, y], j) => `${j === 0 ? "M" : "L"}${x},${y}`).join("");
        const area = `${line}L${points[points.length - 1][0]},${h}L${points[0][0]},${h}Z`;
        return (
          <g key={i}>
            <path d={area} fill={`url(#${gradientId})`} />
            <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}

function ChangePill({ pct, tone }: { pct: number; tone: NonNullable<Stat["changeTone"]> }) {
  const flat = Math.abs(pct) < 1;
  const color = flat || tone === "neutral" ? "bg-muted text-muted-foreground" : pct > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums", color)}>
      {flat ? "±0%" : `${pct > 0 ? "↑" : "↓"} ${formatPercent(Math.abs(pct)).replace("+", "")}`}
    </span>
  );
}

const TONE_CHIP: Record<NonNullable<Stat["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  warning: "bg-warning/15 text-warning",
};

function StatCard({ stat }: { stat: Stat }) {
  const animated = useCountUp(stat.value ?? 0);
  const display = stat.value === null ? "—" : FORMATTERS[stat.formatKind](animated);

  const body = (
    <div
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all duration-200",
        stat.href && "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      )}
    >
      <div className="flex flex-1 flex-col gap-2 p-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</span>
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", TONE_CHIP[stat.tone ?? "default"])}>
            {stat.icon}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-2xl tabular-nums text-foreground">{display}</span>
          {stat.changePct !== undefined && stat.changePct !== null && (
            <ChangePill pct={stat.changePct} tone={stat.changeTone ?? "up-is-good"} />
          )}
        </div>
        {(stat.hint || (stat.changePct !== undefined && stat.changePct !== null)) && (
          <span className="text-xs text-muted-foreground">
            {[stat.changePct !== undefined && stat.changePct !== null ? (stat.changeLabel ?? "vs the week before") : null, stat.hint]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
      {stat.trend ? (
        <CardTrend values={stat.trend} color={stat.trendColor ?? "var(--chart-1)"} />
      ) : (
        <div className="h-2" aria-hidden />
      )}
    </div>
  );

  if (stat.href) {
    return (
      <Link href={stat.href} className="h-full rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {body}
      </Link>
    );
  }
  return body;
}

// Fleet-wide totals above the per-client table — a quick "how's everything
// doing" glance before scanning individual rows. Derived from the exact
// same cells the table renders (see sumOkOrUnverified), never a separate
// fetch, so it can't disagree with what's below it.
export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  );
}
