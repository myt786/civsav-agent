"use client";

import { useState } from "react";
import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; suggestions: string[] };

// Generated on demand, per client, rather than for all 58+ clients up
// front — same reasoning as Insights' AiSummary: the underlying numbers
// are already visible above without it, so there's no reason to pay for a
// model call before someone actually opens this client and wants it.
export function SeoAiSuggestions({ clientId }: { clientId: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function generate() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/seo/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const { suggestions }: { suggestions: string[] } = await res.json();
      setState({ status: "ok", suggestions });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Failed to generate suggestions" });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card shadow-sm px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <SparklesIcon className="size-3.5" aria-hidden />
          </span>
          AI suggestions
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={generate}
          disabled={state.status === "loading"}
          className="h-7 gap-1.5 text-xs"
        >
          <RefreshCwIcon className={cn("size-3.5", state.status === "loading" && "animate-spin")} aria-hidden />
          {state.status === "ok" ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {state.status === "idle" && (
        <p className="text-sm text-muted-foreground">Turn this client&apos;s numbers into a few concrete next steps.</p>
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
        <ul className="flex animate-in flex-col gap-2 text-sm text-foreground fade-in-0 slide-in-from-bottom-1 duration-300">
          {state.suggestions.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
