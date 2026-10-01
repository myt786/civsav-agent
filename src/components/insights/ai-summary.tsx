"use client";

import { LinkifiedText } from "@/components/linkified-text";
import { useState } from "react";
import { AlertTriangleIcon, RefreshCwIcon, SendIcon, SparklesIcon } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface FleetNarrative {
  fleetSummary: string;
  clientNotes: { clientId: string; clientName: string; tone?: "concern" | "good"; note: string }[];
  dataIssues?: { what: string; reason: string; clients: string[] }[];
}

function NoteGroup({
  title,
  tone,
  notes,
}: {
  title: string;
  tone: "concern" | "good";
  notes: FleetNarrative["clientNotes"];
}) {
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span className={cn("size-1.5 rounded-full", tone === "concern" ? "bg-warning" : "bg-success")} aria-hidden />
        {title}
        <span className="tabular-nums">{notes.length}</span>
      </h4>
      <ul className="flex flex-col">
        {notes.map((note) => (
          <li
            key={note.clientId}
            className="grid grid-cols-1 gap-x-3 border-b border-border/60 py-1.5 last:border-b-0 sm:grid-cols-[minmax(0,10rem)_1fr]"
          >
            <span className="truncate font-medium text-foreground" title={note.clientName}>
              {note.clientName}
            </span>
            <LinkifiedText text={note.note} className="text-muted-foreground" />
          </li>
        ))}
      </ul>
    </div>
  );
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
    } catch {
      setState({ status: "error", message: "Couldn't write the summary right now. Please try again in a minute." });
    }
  }

  const [sending, setSending] = useState(false);
  async function sendToSlack() {
    setSending(true);
    try {
      const res = await fetch("/api/insights/slack-digest", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error);
      if (body?.slack?.posted) {
        toast({ variant: "success", title: "Sent to Slack", description: "Posted the daily summary to your Slack channel." });
      } else {
        toast({ variant: "error", title: "Slack isn't set up yet", description: "Ask whoever manages the app to connect Slack." });
      }
    } catch {
      toast({ variant: "error", title: "Couldn't post to Slack", description: "Please try again in a minute." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card shadow-sm px-4 py-3">
      {/* The section heading above already says "AI summary" — the card
          itself only needs the action and what it does. */}
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <SparklesIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
          {state.status === "ok"
            ? "Written by AI from this week's numbers."
            : "Get a short written summary of how all your clients did this week."}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={sendToSlack}
            disabled={sending}
            className="h-7 gap-1.5 text-xs"
            title="Post today's summary to Slack (it's also sent automatically every morning)"
          >
            <SendIcon className="size-3.5" aria-hidden />
            {sending ? "Sending…" : "Send to Slack"}
          </Button>
          <Button variant="ghost" size="sm" onClick={generate} disabled={state.status === "loading"} className="h-7 gap-1.5 text-xs">
            <RefreshCwIcon className={cn("size-3.5", state.status === "loading" && "animate-spin")} aria-hidden />
            {state.status === "ok" ? "Write again" : "Write summary"}
          </Button>
        </div>
      </div>

      {state.status === "loading" && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}

      {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}

      {state.status === "ok" && (
        <div className="flex animate-in flex-col gap-4 text-sm fade-in-0 slide-in-from-bottom-1 duration-300">
          <p className="text-[15px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
            {state.narrative.fleetSummary}
          </p>

          {(state.narrative.dataIssues?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {state.narrative.dataIssues!.map((issue) => (
                <p key={`${issue.what}|${issue.reason}`} className="flex items-start gap-1.5">
                  <AlertTriangleIcon className="mt-0.5 size-3 shrink-0 text-destructive" aria-hidden />
                  <span>
                    <span className="font-medium text-foreground">
                      {issue.what} not updating for {issue.clients.length}{" "}
                      {issue.clients.length === 1 ? "client" : "clients"}
                    </span>{" "}
                    — see Needs attention.
                  </span>
                </p>
              ))}
            </div>
          )}

          <NoteGroup
            title="Needs a look"
            tone="concern"
            notes={state.narrative.clientNotes.filter((n) => n.tone !== "good")}
          />
          <NoteGroup
            title="Going well"
            tone="good"
            notes={state.narrative.clientNotes.filter((n) => n.tone === "good")}
          />
        </div>
      )}
    </div>
  );
}
