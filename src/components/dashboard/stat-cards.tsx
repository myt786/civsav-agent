import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "warning";
  href?: string;
}

function StatCard({ stat }: { stat: Stat }) {
  const Icon = stat.icon;
  const body = (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors",
        stat.href && "hover:border-primary/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{stat.label}</span>
        <Icon
          className={cn("size-4 shrink-0", stat.tone === "warning" ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground/50")}
          aria-hidden
        />
      </div>
      <span className="font-mono text-2xl tabular-nums text-foreground">{stat.value}</span>
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
      {stats.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  );
}
