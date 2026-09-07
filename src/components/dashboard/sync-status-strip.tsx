import { AlertTriangleIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { PLATFORM_LABELS } from "@/lib/dashboard/constants";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";
import type { SyncStatusStrip as SyncStatusStripData } from "@/lib/dashboard/types";

export function SyncStatusStrip({ data, now }: { data: SyncStatusStripData; now: Date }) {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div tabIndex={0} className="flex w-fit cursor-help items-center gap-2 text-xs text-muted-foreground outline-none">
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
          </TooltipTrigger>
          <TooltipContent className="max-w-72 text-pretty">
            The most recent sync across every platform and every active client. Runs automatically once a day, plus
            on demand via Sync now — completed with errors means some platforms failed while others still updated;
            failed means every attempt in that run errored.
          </TooltipContent>
        </Tooltip>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4 lg:grid-cols-8">
          {data.connectors.map((connector) => (
            <div key={connector.platform} className="flex flex-col gap-1 bg-card p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-foreground">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      connector.errorCountLastRun > 0
                        ? "bg-destructive"
                        : connector.lastSuccessfulSync
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/30",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{PLATFORM_LABELS[connector.platform]}</span>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="w-fit cursor-help font-mono text-[11px] tabular-nums text-muted-foreground outline-none"
                  >
                    {connector.lastSuccessfulSync
                      ? formatRelativeTime(connector.lastSuccessfulSync, now)
                      : "never synced"}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Most recent successful {PLATFORM_LABELS[connector.platform]} sync, across every client mapped to
                  it.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="w-fit cursor-help font-mono text-[11px] tabular-nums text-muted-foreground/70 outline-none"
                  >
                    {connector.verifiedCount} verified · {connector.unverifiedCount} unverified
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-pretty">
                  Count of recent {PLATFORM_LABELS[connector.platform]} data points whose mapping has (verified) or
                  hasn&apos;t (unverified) been confirmed correct via the Verify action in Settings.
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
