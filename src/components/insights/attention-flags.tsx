import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttentionFlag } from "@/lib/insights/types";

const KIND_LABEL: Record<AttentionFlag["kind"], string> = {
  sync_error: "Sync error",
  stale_sync: "Stale sync",
  leads_down: "Leads down",
  missed_calls_high: "Missed calls",
  position_worsening: "SEO position",
  spend_spike: "Spend spike",
  sessions_drop: "Sessions drop",
};

// Deterministic, rule-based flags — computed from the same cells the table
// already renders, so this list needs no model call and is exact, not a
// best guess. The AI summary panel below narrates these; it never invents
// its own.
export function AttentionFlags({ flags }: { flags: AttentionFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
        Nothing needs attention this week.
      </div>
    );
  }

  const sorted = [...flags].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));

  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {sorted.map((flag, i) => (
        <div
          key={`${flag.clientId}-${flag.kind}-${i}`}
          className={cn(
            "flex animate-in items-start gap-3 border-l-2 px-4 py-3 text-sm fade-in-0 slide-in-from-left-1 fill-mode-both",
            flag.severity === "critical" ? "border-l-destructive bg-destructive/[0.03]" : "border-l-amber-500 bg-amber-500/[0.03]",
          )}
          style={{ animationDelay: `${Math.min(i, 8) * 50}ms`, animationDuration: "300ms" }}
        >
          <AlertTriangleIcon
            className={cn(
              "mt-0.5 size-4 shrink-0",
              flag.severity === "critical" ? "text-destructive" : "text-amber-600 dark:text-amber-500",
            )}
            aria-hidden
          />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{flag.clientName}</span>
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wide uppercase",
                  flag.severity === "critical" ? "text-destructive" : "text-amber-600 dark:text-amber-500",
                )}
              >
                {KIND_LABEL[flag.kind]}
              </span>
            </div>
            <span className="text-muted-foreground">{flag.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
