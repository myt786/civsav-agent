import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tier, Trend } from "@/lib/seo/compute";

// Same 4 buckets + No Data as _tier()/TIER_LABELS in the Python original,
// just without the emoji (color does the same job in a real UI). Only 3
// semantic tokens exist (success/warning/destructive) for 4 severity
// steps, so "small" borrows destructive at reduced intensity — a step
// toward "minimal"'s full destructive, not its own hue.
const TIER_STYLE: Record<Tier, { label: string; className: string }> = {
  strong: { label: "Strong", className: "border-success/30 bg-success/10 text-success" },
  moderate: { label: "Moderate", className: "border-warning/30 bg-warning/10 text-warning" },
  small: { label: "Small", className: "border-destructive/20 bg-destructive/5 text-destructive/80" },
  minimal: { label: "Minimal", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  no_data: { label: "No Data", className: "border-border bg-muted text-muted-foreground" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const { label, className } = TIER_STYLE[tier];
  return (
    <Badge variant="outline" className={cn("font-medium", className)}>
      {label}
    </Badge>
  );
}

const TREND_STYLE: Record<Trend, { label: string; className: string; icon: typeof ArrowUpIcon | null }> = {
  low_vol: { label: "Low Vol", className: "text-muted-foreground", icon: null },
  growing_fast: { label: "Growing fast", className: "text-success", icon: ArrowUpIcon },
  growing: { label: "Growing", className: "text-success", icon: ArrowUpIcon },
  stable: { label: "Stable", className: "text-muted-foreground", icon: MinusIcon },
  declining: { label: "Declining", className: "text-warning", icon: ArrowDownIcon },
  falling_fast: { label: "Falling fast", className: "text-destructive", icon: ArrowDownIcon },
  unknown: { label: "—", className: "text-muted-foreground/50", icon: null },
};

export function TrendIndicator({ trend }: { trend: Trend }) {
  const { label, className, icon: Icon } = TREND_STYLE[trend];
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {label}
    </span>
  );
}
