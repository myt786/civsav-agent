"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const COLLAPSED_COUNT = 6;

// The affected-client list under a grouped attention flag. The only
// interactive piece of that list, so it's the only part that ships as a
// client component.
export function ClientChips({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? names : names.slice(0, COLLAPSED_COUNT);

  return (
    <div className="flex flex-wrap items-center gap-1 pt-0.5">
      {visible.map((name) => (
        <span key={name} className="rounded-md border border-border bg-card px-1.5 py-0.5 text-xs text-foreground">
          {name}
        </span>
      ))}
      {names.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-primary hover:underline"
        >
          {expanded ? "Show fewer" : `+${names.length - COLLAPSED_COUNT} more`}
          <ChevronDownIcon className={cn("size-3 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      )}
    </div>
  );
}
