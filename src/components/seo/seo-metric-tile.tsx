import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeltaCell } from "@/lib/dashboard/types";

// Adapted from a card-grid reference the team shared (big number + label +
// colored delta per platform) — built here from the exact fields /seo
// already computes, never a platform this connector set doesn't have.
export function SeoMetricTile({
  label,
  value,
  subtitle,
  footer,
}: {
  label: string;
  value: string;
  subtitle: string;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card shadow-sm p-3">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
      {footer}
    </div>
  );
}

// A percentage delta line for metrics that have a natural prior-period
// comparison (clicks, impressions, position). The arrow and color both
// follow good/bad news, not the raw number: for "lower is better" metrics
// (avg. position) a rising number used to show a red *up* arrow, which
// reads as good at a glance. Those also say "better"/"worse" outright.
export function DeltaLine({ delta, higherIsBetter = true }: { delta: DeltaCell; higherIsBetter?: boolean }) {
  if (delta.pct === null) return null;
  const isGood = delta.direction === "flat" ? null : delta.direction === "up" ? higherIsBetter : !higherIsBetter;
  const colorClass =
    isGood === null ? "text-muted-foreground" : isGood ? "text-success" : "text-destructive";
  const Icon = isGood === null ? MinusIcon : isGood ? ArrowUpIcon : ArrowDownIcon;
  const verdict = higherIsBetter || isGood === null ? "" : isGood ? " better" : " worse";

  return (
    <span className={cn("mt-0.5 flex items-center gap-1 text-xs font-medium", colorClass)}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(delta.pct).toFixed(1)}%{verdict} vs. last month
    </span>
  );
}

// A plain signed-count footer for metrics with no natural percentage
// baseline (keywords gained/lost, new referring domains) — still colored
// consistently with DeltaLine (green = good, red = bad, muted = flat).
export function CountLine({ value, label, positiveIsGood = true }: { value: number; label: string; positiveIsGood?: boolean }) {
  const isGood = value === 0 ? null : value > 0 ? positiveIsGood : !positiveIsGood;
  const colorClass =
    isGood === null ? "text-muted-foreground" : isGood ? "text-success" : "text-destructive";
  const Icon = value > 0 ? ArrowUpIcon : value < 0 ? ArrowDownIcon : MinusIcon;

  return (
    <span className={cn("mt-0.5 flex items-center gap-1 text-xs font-medium", colorClass)}>
      <Icon className="size-3" aria-hidden />
      {value > 0 ? "+" : ""}
      {value} {label}
    </span>
  );
}
