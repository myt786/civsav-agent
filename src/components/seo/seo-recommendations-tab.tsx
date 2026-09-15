"use client";

import { useMemo, useState } from "react";
import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TierBadge } from "./tier-trend";
import { formatRelativeTime } from "@/lib/dashboard/format";
import type { SeoRecommendationRow } from "@/lib/seo/queries";

// Runs client-side rather than one server call that loops over every
// client — a sitemap fetch + a deeper GSC pull + an LLM call per client
// means 58 of these sequentially would sit right at Vercel's function
// timeout. Batching from the browser (a handful concurrently) has no
// such ceiling and gives real visible progress instead of one long spinner.
const BATCH_CONCURRENCY = 3;

async function generateOne(clientId: string): Promise<{ recommendations: string[]; sitemapUrlCount: number | null; generatedAt: string }> {
  const res = await fetch("/api/seo/recommendations/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function SeoRecommendationsTab({ initialRows }: { initialRows: SeoRecommendationRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const missingCount = useMemo(() => rows.filter((r) => r.recommendations === null).length, [rows]);
  const selected = rows.find((r) => r.clientId === selectedId) ?? null;

  async function regenerate(clientId: string) {
    setGeneratingIds((prev) => new Set(prev).add(clientId));
    setError(null);
    try {
      const result = await generateOne(clientId);
      setRows((prev) =>
        prev.map((r) =>
          r.clientId === clientId
            ? { ...r, recommendations: result.recommendations, sitemapUrlCount: result.sitemapUrlCount, generatedAt: new Date(result.generatedAt) }
            : r,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  }

  async function generateAllMissing() {
    const targets = rows.filter((r) => r.recommendations === null).map((r) => r.clientId);
    if (targets.length === 0) return;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: targets.length });
    setError(null);

    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const clientId = targets[cursor++];
        setGeneratingIds((prev) => new Set(prev).add(clientId));
        try {
          const result = await generateOne(clientId);
          setRows((prev) =>
            prev.map((r) =>
              r.clientId === clientId
                ? { ...r, recommendations: result.recommendations, sitemapUrlCount: result.sitemapUrlCount, generatedAt: new Date(result.generatedAt) }
                : r,
            ),
          );
        } catch {
          // A single client's failure doesn't stop the batch — it just
          // stays "not generated yet" and can be retried individually.
        } finally {
          setGeneratingIds((prev) => {
            const next = new Set(prev);
            next.delete(clientId);
            return next;
          });
          setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, targets.length) }, () => worker()));
    setBulkRunning(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {missingCount > 0
            ? `${missingCount} of ${rows.length} clients don't have a recommendation yet.`
            : `All ${rows.length} clients have a recommendation.`}
        </p>
        <Button size="sm" onClick={generateAllMissing} disabled={bulkRunning || missingCount === 0}>
          <SparklesIcon className={bulkRunning ? "size-3.5 animate-pulse" : "size-3.5"} aria-hidden />
          {bulkRunning ? `Generating ${bulkProgress.done}/${bulkProgress.total}…` : "Generate all missing"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Client
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Tier
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Latest recommendation
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Generated
              </TableHead>
              <TableHead className="h-9 w-24 bg-muted/40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isGenerating = generatingIds.has(row.clientId);
              return (
                <TableRow key={row.clientId} className={row.recommendations ? "cursor-pointer" : undefined} onClick={() => row.recommendations && setSelectedId(row.clientId)}>
                  <TableCell className="font-medium text-foreground">{row.clientName}</TableCell>
                  <TableCell>
                    <TierBadge tier={row.tier} />
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {isGenerating ? "Generating…" : row.recommendations?.[0] ?? "Not generated yet"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.generatedAt ? formatRelativeTime(new Date(row.generatedAt), new Date()) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isGenerating}
                      onClick={(e) => {
                        e.stopPropagation();
                        regenerate(row.clientId);
                      }}
                    >
                      <RefreshCwIcon className={isGenerating ? "size-3 animate-spin" : "size-3"} aria-hidden />
                      {row.recommendations ? "Regenerate" : "Generate"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected && (
          <SheetContent className="sm:max-w-lg" side="right">
            <SheetHeader>
              <SheetTitle>{selected.clientName}</SheetTitle>
              <SheetDescription>
                {selected.generatedAt ? `Generated ${formatRelativeTime(new Date(selected.generatedAt), new Date())}` : "Not generated yet"}
                {selected.sitemapUrlCount !== null && ` · ${selected.sitemapUrlCount} sitemap URLs considered`}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-6">
              <ul className="flex flex-col gap-3 text-sm text-foreground">
                {(selected.recommendations ?? []).map((rec, i) => (
                  <li key={i} className="flex gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span className="break-words">{rec}</span>
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="outline" disabled={generatingIds.has(selected.clientId)} onClick={() => regenerate(selected.clientId)} className="self-start">
                <RefreshCwIcon className={generatingIds.has(selected.clientId) ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
                Regenerate
              </Button>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
