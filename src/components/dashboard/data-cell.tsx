import { AlertTriangleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CellState, DeltaCell } from "@/lib/dashboard/types";
import { formatPercent } from "@/lib/dashboard/format";

// The four data states, rendered so they can never be mistaken for one
// another at a glance: a real number, a muted em dash, a warning icon with
// the error behind a tooltip, or a muted italic number carrying an
// "unverified" badge. A cell must never fall back to any of these except
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
    return (
      <span className={cn("flex items-center gap-1.5 font-mono tabular-nums text-muted-foreground italic", alignClass)}>
        {text}
        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] font-sans leading-none not-italic">
          unverified
        </Badge>
      </span>
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
      ? "text-emerald-600 dark:text-emerald-500"
      : delta.direction === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <span className={cn("flex items-center justify-end gap-1 font-mono tabular-nums", colorClass)}>
      {formatPercent(delta.pct)}
    </span>
  );
}
