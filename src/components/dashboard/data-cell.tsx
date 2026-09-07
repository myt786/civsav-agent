import { AlertTriangleIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CellState, DeltaCell } from "@/lib/dashboard/types";
import { formatPercent } from "@/lib/dashboard/format";

// The four data states, rendered so they can never be mistaken for one
// another at a glance: a real number, a labeled em dash, an error with
// details in a tooltip, or an unverified value with a focusable indicator.
// A cell must never fall back to any of these except
// the one that actually matches its state — in particular, an error must
// never render a number.
export function DataCell<T>({
  state,
  format,
  align = "end",
}: {
  state: CellState<T>;
  format: (value: T) => string;
  align?: "start" | "end";
}) {
  const alignClass =
    align === "end" ? "justify-end text-right" : "justify-start text-left";

  if (state.kind === "no_data") {
    return (
      <span
        title="No data"
        className={cn(
          "flex items-center tabular-nums text-muted-foreground",
          alignClass,
        )}
      >
        <span aria-hidden>—</span>
        <span className="sr-only">No data</span>
      </span>
    );
  }

  if (state.kind === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              "flex items-center gap-1 font-mono tabular-nums text-destructive",
              alignClass,
            )}
          >
            <AlertTriangleIcon className="size-3.5" aria-hidden />
            <span className="text-xs">Error</span>
            <span className="sr-only">: sync failed</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-pretty">
          {state.message}
        </TooltipContent>
      </Tooltip>
    );
  }

  const text = format(state.value);

  if (state.kind === "unverified") {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 font-mono tabular-nums text-amber-700 dark:text-amber-500",
          alignClass,
        )}
      >
        {text}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label="Unverified value"
              className="text-[10px] font-sans"
            >
              ◦
            </span>
          </TooltipTrigger>
          <TooltipContent>
            This value has not been verified against its source.
          </TooltipContent>
        </Tooltip>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex items-center font-mono tabular-nums text-foreground",
        alignClass,
      )}
    >
      {text}
    </span>
  );
}

export function DeltaCellView({ delta }: { delta: DeltaCell }) {
  if (delta.pct === null) {
    return (
      <span
        title="No comparison available"
        className="flex items-center justify-end font-mono tabular-nums text-muted-foreground"
      >
        <span aria-hidden>—</span>
        <span className="sr-only">No comparison available</span>
      </span>
    );
  }

  const colorClass =
    delta.direction === "up"
      ? "text-[#397257]"
      : delta.direction === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <span
      className={cn(
        "flex items-center justify-end gap-1 font-mono tabular-nums",
        colorClass,
      )}
    >
      {formatPercent(delta.pct)}
    </span>
  );
}
