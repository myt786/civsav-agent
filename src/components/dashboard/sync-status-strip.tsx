import { AlertTriangleIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PLATFORM_LABELS } from "@/lib/dashboard/constants";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";
import type { SyncStatusStrip as SyncStatusStripData } from "@/lib/dashboard/types";

export function SyncStatusStrip({ data, now }: { data: SyncStatusStripData; now: Date }) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Last sync run</span>
          <span className="font-mono tabular-nums text-foreground">
            {data.lastRunAt ? formatRelativeTime(data.lastRunAt, now) : "never"}
          </span>
          {data.lastRunStatus && (
            <span
              className={cn(
                "font-mono lowercase",
                data.lastRunStatus === "failed"
                  ? "text-destructive"
                  : data.lastRunStatus === "completed_with_errors"
                    ? "text-amber-600 dark:text-amber-500"
                    : "text-muted-foreground",
              )}
            >
              · {data.lastRunStatus.replace(/_/g, " ")}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4 lg:grid-cols-8">
          {data.connectors.map((connector) => (
            <div key={connector.platform} className="flex flex-col gap-1 bg-card p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-medium text-foreground">
                  {PLATFORM_LABELS[connector.platform]}
                </span>
                {connector.errorCountLastRun > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="flex items-center gap-0.5 text-destructive">
                        <AlertTriangleIcon className="size-3" aria-hidden />
                        <span className="font-mono text-[11px] tabular-nums">{connector.errorCountLastRun}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {connector.errorCountLastRun} error{connector.errorCountLastRun === 1 ? "" : "s"} in the most
                      recent sync run
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {connector.lastSuccessfulSync ? formatRelativeTime(connector.lastSuccessfulSync, now) : "never synced"}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
                {connector.verifiedCount} verified · {connector.unverifiedCount} unverified
              </span>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
