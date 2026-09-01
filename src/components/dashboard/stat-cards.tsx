"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatCurrency, formatInteger } from "@/lib/dashboard/format";
import { useCountUp } from "@/lib/use-count-up";
import { cn } from "@/lib/utils";

// formatKind (not a function prop) because these are server components
// building the stats array — a raw function reference can't cross the
// server/client boundary, only serializable data and already-rendered
// elements (icon is a ReactNode for the same reason: rendered server-side,
// not a component reference).
export type StatFormatKind = "integer" | "currency";

const FORMATTERS: Record<StatFormatKind, (n: number) => string> = {
  integer: formatInteger,
  currency: formatCurrency,
};

export interface Stat {
  label: string;
  value: number | null;
  formatKind: StatFormatKind;
  icon: ReactNode;
  tone?: "default" | "warning";
  href?: string;
}

const TONE_CHIP: Record<NonNullable<Stat["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-500",
};

function StatCard({ stat, delayMs }: { stat: Stat; delayMs: number }) {
  const animated = useCountUp(stat.value ?? 0);
  const display = stat.value === null ? "—" : FORMATTERS[stat.formatKind](animated);

  const body = (
    <div
      className={cn(
        "group flex animate-in flex-col gap-3 rounded-lg border border-border bg-card p-4 fade-in-0 slide-in-from-bottom-1 transition-all duration-200 fill-mode-both",
        stat.href && "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      )}
      style={{ animationDelay: `${delayMs}ms`, animationDuration: "400ms" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</span>
        <span className={cn("flex size-7 items-center justify-center rounded-md", TONE_CHIP[stat.tone ?? "default"])}>
          {stat.icon}
        </span>
      </div>
      <span className="font-mono text-2xl tabular-nums text-foreground">{display}</span>
    </div>
  );

  if (stat.href) {
    return (
      <Link href={stat.href} className="rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
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
      {stats.map((stat, i) => (
        <StatCard key={stat.label} stat={stat} delayMs={i * 60} />
      ))}
    </div>
  );
}
