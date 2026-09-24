import { AlertTriangleIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CellState, DeltaCell } from "@/lib/dashboard/types";
import { formatPercent } from "@/lib/dashboard/format";

// The four data states, rendered so they can never be mistaken for one
// another at a glance: a real number, a muted em dash, a warning icon with
// the error behind a tooltip, or a number carrying a small hollow
// "unverified" ring. A cell must never fall back to any of these except
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
  const alignClass = align === "end" ? "justify-end text-right" : "justify-start text-left";

  if (state.kind === "no_data") {
    return (
      <span className={cn("flex items-center font-mono tabular-nums text-muted-foreground/50", alignClass)}>—</span>
    );
  }

  if (state.kind === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn("flex items-center gap-1 font-mono tabular-nums text-destructive", alignClass)}
          >
            <AlertTriangleIcon className="size-3.5" aria-hidden />
            <span className="sr-only">Sync error</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-pretty">{state.message}</TooltipContent>
      </Tooltip>
    );
  }

  const text = format(state.value);

  if (state.kind === "unverified") {
    // A small hollow ring, not a full "unverified" badge: nearly every cell
    // is unverified until mappings are confirmed in Settings, so a word badge
    // on each one drowned out the numbers and pushed the table past the
    // viewport. The ring stays distinct from a verified number (solid text,
    // no marker) and from warnings (amber is reserved for those). The table
    // legend explains it; the tooltip repeats it where the ring is hovered.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn("flex cursor-help items-center gap-1.5 font-mono tabular-nums text-foreground/85 outline-none", alignClass)}
          >
            {text}
            <UnverifiedMark />
            <span className="sr-only">(unverified)</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-pretty">
          Unverified — this client&apos;s account mapping hasn&apos;t been confirmed in Settings yet.
        </TooltipContent>
      </Tooltip>
    );
  }

  return <span className={cn("flex items-center font-mono tabular-nums text-foreground", alignClass)}>{text}</span>;
}

export function DeltaCellView({ delta }: { delta: DeltaCell }) {
  if (delta.pct === null) {
    return (
      <span className="flex items-center justify-end font-mono tabular-nums text-muted-foreground/50">—</span>
    );
  }

  const colorClass =
    delta.direction === "up"
      ? "text-success"
      : delta.direction === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <span className={cn("flex items-center justify-end gap-1 font-mono tabular-nums", colorClass)}>
      {formatPercent(delta.pct)}
    </span>
  );
}

// Shared with the table legends so the marker the legend describes is
// literally the same element the cells render.
export function UnverifiedMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0 rounded-full border border-muted-foreground/70", className)}
      aria-hidden
    />
  );
}
