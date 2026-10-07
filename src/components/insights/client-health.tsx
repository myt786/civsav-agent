"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { formatRelativeTime } from "@/lib/dashboard/format";
import type { ClientHealthEntry } from "@/lib/analysis/queries";
import { cn } from "@/lib/utils";

function tone(score: number) {
  return score >= 80
    ? "bg-success/10 text-success"
    : score >= 60
      ? "bg-primary/10 text-primary"
      : score >= 40
        ? "bg-warning/15 text-warning"
        : "bg-destructive/10 text-destructive";
}

// Insights → Client health: every client's latest AI analysis, weakest
// first, and "Analyse all" — one request per client from the browser, so
// no single server call has to cover every client.
export function ClientHealth({
  entries,
  clients,
  aiConfigured,
}: {
  entries: ClientHealthEntry[];
  clients: { id: string; name: string }[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  async function analyseAll() {
    if (!window.confirm(`Run an AI analysis of the last 30 days for all ${clients.length} clients? It takes a few minutes.`)) return;
    let done = 0;
    let failed = 0;
    setProgress({ done, total: clients.length, failed });
    for (const client of clients) {
      try {
        const response = await fetch("/api/analysis/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: client.id }),
        });
        // 429 = analysed in the last few minutes already; not a failure.
        if (!response.ok && response.status !== 429) failed++;
      } catch {
        failed++;
      }
      done++;
      setProgress({ done, total: clients.length, failed });
    }
    toast({
      variant: failed > 0 ? "error" : "success",
      title: failed > 0 ? `Analysis finished · ${failed} couldn't run` : "All clients analysed",
      description: failed > 0 ? "Clients with no numbers yet can't be analysed. Open one to see why." : undefined,
    });
    setProgress(null);
    router.refresh();
  }

  return (
    <section id="client-health" className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Client health · AI analysis</h2>
          <p className="text-sm text-muted-foreground">
            Each client&apos;s latest analysis, weakest first. Runs on the 2nd of every month, or on demand.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={analyseAll} disabled={progress !== null || !aiConfigured || clients.length === 0}>
          {progress ? <Loader2Icon className="size-3.5 animate-spin" /> : <SparklesIcon className="size-3.5" />}
          {progress ? `Analysing ${progress.done} of ${progress.total}…` : "Analyse all"}
        </Button>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No analyses yet. Click <strong>Analyse all</strong>, or open a client and use <strong>Run first analysis</strong>.
        </div>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {entries.map((e) => (
            <li key={e.clientId} className="border-b border-border last:border-b-0">
              <Link
                href={`/settings/clients/${e.clientId}#analysis`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums", tone(e.healthScore))}>
                  {e.healthScore}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{e.clientName}</span>
                  <span className="truncate text-xs text-muted-foreground">{e.headline}</span>
                </div>
                <div className="hidden shrink-0 flex-col items-end text-xs text-muted-foreground sm:flex">
                  <span>
                    {e.openHigh > 0 ? <span className="font-medium text-destructive">{e.openHigh} high · </span> : null}
                    {e.openTotal} open
                  </span>
                  <span>{formatRelativeTime(new Date(e.generatedAt), new Date())}</span>
                </div>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
