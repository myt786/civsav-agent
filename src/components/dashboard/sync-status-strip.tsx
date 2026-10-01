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
              <span>Data last updated</span>
              <span className="font-mono tabular-nums text-foreground">
                {data.lastRunAt ? formatRelativeTime(data.lastRunAt, now) : "never"}
              </span>
              {data.lastRunStatus && (
                <span
                  className={cn(
                    "lowercase",
                    data.lastRunStatus === "failed"
                      ? "text-destructive"
                      : data.lastRunStatus === "completed_with_errors"
                        ? "text-warning"
                        : "text-muted-foreground",
                  )}
                >
                  ·{" "}
                  {data.lastRunStatus === "failed"
                    ? "failed"
                    : data.lastRunStatus === "completed_with_errors"
                      ? "some platforms had problems"
                      : data.lastRunStatus === "running"
                        ? "updating now"
                        : "all good"}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-72 text-pretty">
            When we last pulled fresh numbers from every platform for every active client. This happens
            automatically once a day, or any time you click &ldquo;Update data now&rdquo; in Settings.
          </TooltipContent>
        </Tooltip>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4 lg:grid-cols-8">
          {data.connectors.map((connector) => {
            const total = connector.verifiedCount + connector.unverifiedCount;
            return (
              <div key={connector.platform} className="flex min-w-0 flex-col gap-1 bg-card p-2.5">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      connector.errorCountLastRun > 0
                        ? "bg-destructive"
                        : connector.lastSuccessfulSync
                          ? "bg-success"
                          : "bg-muted-foreground/30",
                    )}
                    aria-hidden
                  />
                  <span className="truncate" title={PLATFORM_LABELS[connector.platform]}>
                    {PLATFORM_LABELS[connector.platform]}
                  </span>
                </span>
                {/* Error count sits on the time line, not the name line, so
                    it no longer truncates longer platform names. */}
                <div className="flex items-center justify-between gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        tabIndex={0}
                        className="w-fit cursor-help truncate font-mono text-[11px] tabular-nums text-muted-foreground outline-none"
                      >
                        {connector.lastSuccessfulSync
                          ? formatRelativeTime(connector.lastSuccessfulSync, now)
                          : "not connected yet"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      When {PLATFORM_LABELS[connector.platform]} numbers were last updated successfully.
                    </TooltipContent>
                  </Tooltip>
                  {connector.errorCountLastRun > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="flex shrink-0 items-center gap-0.5 text-destructive">
                          <AlertTriangleIcon className="size-3" aria-hidden />
                          <span className="font-mono text-[11px] tabular-nums">{connector.errorCountLastRun}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {connector.errorCountLastRun} client{connector.errorCountLastRun === 1 ? "" : "s"} couldn&apos;t
                        be updated last time. See Insights for why.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="w-fit cursor-help truncate font-mono text-[11px] tabular-nums text-muted-foreground/70 outline-none"
                    >
                      {total === 0
                        ? "no clients connected"
                        : `${connector.verifiedCount} of ${total} client${total === 1 ? "" : "s"} checked`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64 text-pretty">
                    How many clients&apos; {PLATFORM_LABELS[connector.platform]} accounts have been checked in
                    Settings. Unchecked ones are probably fine — click &ldquo;Check all accounts&rdquo; in Settings to
                    confirm them.
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
