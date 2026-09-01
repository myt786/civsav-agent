"use client";

import { useState } from "react";
import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface FleetNarrative {
  fleetSummary: string;
  clientNotes: { clientId: string; clientName: string; note: string }[];
}

type State = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ok"; narrative: FleetNarrative };

// Generated on demand rather than on every page load — the underlying
// numbers are already fully visible without it, so there's no reason to
// pay for a model call before someone actually wants the narrated version.
export function AiSummary() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function generate() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/insights/narrative", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const narrative: FleetNarrative = await res.json();
      setState({ status: "ok", narrative });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Failed to generate summary" });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SparklesIcon className="size-3.5" aria-hidden />
          </span>
          AI summary
        </div>
        <Button variant="ghost" size="sm" onClick={generate} disabled={state.status === "loading"} className="h-7 gap-1.5 text-xs">
          <RefreshCwIcon className={cn("size-3.5", state.status === "loading" && "animate-spin")} aria-hidden />
          {state.status === "ok" ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {state.status === "idle" && (
        <p className="text-sm text-muted-foreground">
          Turn this week&apos;s numbers and flags into a plain-English summary of the fleet.
        </p>
      )}

      {state.status === "loading" && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}

      {state.status === "ok" && (
        <div className="flex animate-in flex-col gap-3 text-sm fade-in-0 slide-in-from-bottom-1 duration-300">
          <p className="text-foreground">{state.narrative.fleetSummary}</p>
          {state.narrative.clientNotes.length > 0 && (
            <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
              {state.narrative.clientNotes.map((note) => (
                <li key={note.clientId} className="flex gap-2">
                  <span className="shrink-0 font-medium text-foreground">{note.clientName}:</span>
                  <span className="text-muted-foreground">{note.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
