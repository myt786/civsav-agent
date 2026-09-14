import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tier, Trend } from "@/lib/seo/compute";

// Same 4 buckets + No Data as _tier()/TIER_LABELS in the Python original,
// just without the emoji (color does the same job in a real UI).
const TIER_STYLE: Record<Tier, { label: string; className: string }> = {
  strong: { label: "Strong", className: "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-500" },
  moderate: { label: "Moderate", className: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-500" },
  small: { label: "Small", className: "border-orange-600/30 bg-orange-500/10 text-orange-700 dark:text-orange-500" },
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
  growing_fast: { label: "Growing fast", className: "text-emerald-600 dark:text-emerald-500", icon: ArrowUpIcon },
  growing: { label: "Growing", className: "text-emerald-600 dark:text-emerald-500", icon: ArrowUpIcon },
  stable: { label: "Stable", className: "text-muted-foreground", icon: MinusIcon },
  declining: { label: "Declining", className: "text-amber-700 dark:text-amber-500", icon: ArrowDownIcon },
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
