"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  CheckIcon,
  ClipboardCopyIcon,
  FileTextIcon,
  ListChecksIcon,
  NotebookPenIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedFilter } from "@/components/ui/segmented-filter";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toaster";
import { TierBadge } from "./tier-trend";
import { LinkifiedText, shortenUrls } from "@/components/linkified-text";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";
import { setRecommendationStatus } from "@/app/seo/actions";
import {
  CATEGORY_LABELS,
  EFFORT_LABELS,
  PRIORITY_LABELS,
  recommendationsAsText,
  sortItems,
  type RecommendationItem,
  type RecommendationSources,
  type RecPriority,
  type RecStatus,
} from "@/lib/seo/recommendation-items";
import type { SeoRecommendationRow } from "@/lib/seo/queries";

// Runs client-side rather than one server call that loops over every
// client — a sitemap fetch + a deeper GSC pull + an LLM call per client
// means 58 of these sequentially would sit right at Vercel's function
// timeout. Batching from the browser (a handful concurrently) has no
// such ceiling and gives real visible progress instead of one long spinner.
const BATCH_CONCURRENCY = 3;

// A list older than this was written from numbers that have since moved.
const STALE_DAYS = 30;

interface GenerateResponse {
  items: RecommendationItem[];
  sources: RecommendationSources | null;
  generatedAt: string;
}

async function generateOne(clientId: string): Promise<GenerateResponse> {
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

type Filter = "all" | "missing" | "high" | "stale";

const PRIORITY_STYLE: Record<RecPriority, { dot: string; pill: string; edge: string }> = {
  high: { dot: "bg-destructive", pill: "bg-destructive/10 text-destructive", edge: "border-l-destructive" },
  medium: { dot: "bg-warning", pill: "bg-warning/10 text-warning", edge: "border-l-warning" },
  low: { dot: "bg-muted-foreground/50", pill: "bg-muted text-muted-foreground", edge: "border-l-border" },
};

function isStale(row: SeoRecommendationRow, now: Date) {
  return row.generatedAt !== null && now.getTime() - new Date(row.generatedAt).getTime() > STALE_DAYS * 86_400_000;
}

function openItems(row: SeoRecommendationRow) {
  return sortItems((row.items ?? []).filter((item) => item.status === "open"));
}

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-5 whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}

// A URL target becomes a short link; a search query is shown in quotes.
function Target({ target }: { target: string }) {
  if (/^https?:\/\//.test(target)) {
    return (
      <Pill className="max-w-full bg-primary/5 text-primary">
        <FileTextIcon className="size-3 shrink-0" aria-hidden />
        <LinkifiedText text={target} className="truncate" />
      </Pill>
    );
  }
  return (
    <Pill className="max-w-full bg-primary/5 text-primary">
      <SearchIcon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">“{target}”</span>
    </Pill>
  );
}

function SourcesLine({ sources }: { sources: RecommendationSources | null }) {
  if (!sources) return null;
  const parts = [
    sources.sitemapUrls === null ? "no sitemap found" : `${sources.sitemapUrls} sitemap pages`,
    sources.gscQueries > 0 ? `${sources.gscQueries} search queries` : "no Search Console detail",
    sources.gscPages > 0 ? `${sources.gscPages} top pages` : null,
    sources.notesMonths > 0 ? `${sources.notesMonths} ${sources.notesMonths === 1 ? "month" : "months"} of team notes` : null,
  ].filter(Boolean);
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/70">Based on</span>
      {parts.map((part) => (
        <Pill key={part} className="bg-muted text-muted-foreground">
          {part}
        </Pill>
      ))}
    </p>
  );
}

function ItemCard({
  item,
  pending,
  onStatus,
}: {
  item: RecommendationItem;
  pending: boolean;
  onStatus: (status: RecStatus) => void;
}) {
  const closed = item.status !== "open";
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-l-4 border-border bg-card p-3.5 shadow-sm",
        PRIORITY_STYLE[item.priority].edge,
        closed && "border-l-border bg-muted/30 shadow-none",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onStatus(item.status === "done" ? "open" : "done")}
          disabled={pending}
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
            item.status === "done" ? "border-success bg-success text-white" : "border-border hover:border-success hover:bg-success/10",
          )}
          aria-label={item.status === "done" ? `Mark "${item.title}" as not done` : `Mark "${item.title}" as done`}
        >
          {item.status === "done" && <CheckIcon className="size-3.5" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className={cn("text-sm font-medium text-foreground", closed && "text-muted-foreground line-through")}>
            <LinkifiedText text={item.title} />
          </p>
          {!closed && item.detail && (
            <p className="text-sm text-muted-foreground">
              <LinkifiedText text={item.detail} />
            </p>
          )}
          {!closed && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill className={PRIORITY_STYLE[item.priority].pill}>{PRIORITY_LABELS[item.priority]} priority</Pill>
              <Pill className="bg-muted text-muted-foreground">{CATEGORY_LABELS[item.category]}</Pill>
              <Pill className="bg-muted text-muted-foreground">{EFFORT_LABELS[item.effort]}</Pill>
              {item.target && <Target target={item.target} />}
            </div>
          )}
          {closed && (
            <p className="text-xs text-muted-foreground">
              {item.status === "done" ? "Done" : "Dismissed"}
              {item.statusAt && ` ${formatRelativeTime(new Date(item.statusAt), new Date())}`}
            </p>
          )}
        </div>
        {item.status === "open" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground"
            disabled={pending}
            onClick={() => onStatus("dismissed")}
            title="Not useful — leave it off future lists"
          >
            <XIcon className="size-3.5" />
            Dismiss
          </Button>
        ) : (
          <Button type="button" size="sm" variant="ghost" className="shrink-0 text-muted-foreground" disabled={pending} onClick={() => onStatus("open")}>
            <RotateCcwIcon className="size-3.5" />
            Reopen
          </Button>
        )}
      </div>
    </li>
  );
}

export function SeoRecommendationsTab({ initialRows }: { initialRows: SeoRecommendationRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ label: string; done: number; total: number } | null>(null);
  const cancelBulk = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set());
  const [, startStatus] = useTransition();

  const now = useMemo(() => new Date(), []);
  const selected = rows.find((r) => r.clientId === selectedId) ?? null;

  const counts = useMemo(() => {
    const written = rows.filter((r) => r.items !== null);
    const all = rows.flatMap((r) => r.items ?? []);
    return {
      all: rows.length,
      missing: rows.length - written.length,
      high: rows.filter((r) => openItems(r).some((item) => item.priority === "high")).length,
      stale: rows.filter((r) => isStale(r, now)).length,
      openHigh: all.filter((item) => item.status === "open" && item.priority === "high").length,
      open: all.filter((item) => item.status === "open").length,
      done: all.filter((item) => item.status === "done").length,
    };
  }, [rows, now]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.clientName.toLowerCase().includes(q)) return false;
      if (filter === "missing") return row.items === null;
      if (filter === "high") return openItems(row).some((item) => item.priority === "high");
      if (filter === "stale") return isStale(row, now);
      return true;
    });
  }, [rows, filter, search, now]);

  function applyResult(clientId: string, result: GenerateResponse) {
    setRows((prev) =>
      prev.map((r) =>
        r.clientId === clientId ? { ...r, items: result.items, sources: result.sources, generatedAt: new Date(result.generatedAt) } : r,
      ),
    );
  }

  function markGenerating(clientId: string, on: boolean) {
    setGeneratingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(clientId);
      else next.delete(clientId);
      return next;
    });
  }

  function markFailed(clientId: string, failed: boolean) {
    setFailedIds((prev) => {
      const next = new Set(prev);
      if (failed) next.add(clientId);
      else next.delete(clientId);
      return next;
    });
  }

  async function regenerate(clientId: string) {
    markGenerating(clientId, true);
    markFailed(clientId, false);
    try {
      applyResult(clientId, await generateOne(clientId));
    } catch {
      markFailed(clientId, true);
      toast({ variant: "error", title: "Couldn't write recommendations", description: "Please try again in a minute." });
    } finally {
      markGenerating(clientId, false);
    }
  }

  async function runBulk(targets: string[], label: string) {
    if (targets.length === 0) return;
    cancelBulk.current = false;
    setBulk({ label, done: 0, total: targets.length });
    let cursor = 0;
    let failures = 0;
    async function worker() {
      while (cursor < targets.length && !cancelBulk.current) {
        const clientId = targets[cursor++];
        markGenerating(clientId, true);
        markFailed(clientId, false);
        try {
          applyResult(clientId, await generateOne(clientId));
        } catch {
          // One client failing doesn't stop the batch — its row says so and
          // can be retried on its own.
          failures++;
          markFailed(clientId, true);
        } finally {
          markGenerating(clientId, false);
          setBulk((b) => (b ? { ...b, done: b.done + 1 } : b));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, targets.length) }, () => worker()));
    setBulk(null);
    if (failures > 0) {
      toast({ variant: "error", title: `${failures} couldn't be written`, description: "They're marked in the table — try those again." });
    } else if (!cancelBulk.current) {
      toast({ variant: "success", title: "Recommendations written" });
    }
  }

  function updateStatus(clientId: string, item: RecommendationItem, status: RecStatus) {
    const previous = item.status;
    const setItem = (s: RecStatus, at: string | null) =>
      setRows((prev) =>
        prev.map((r) =>
          r.clientId === clientId
            ? { ...r, items: (r.items ?? []).map((it) => (it.id === item.id ? { ...it, status: s, statusAt: at } : it)) }
            : r,
        ),
      );
    setItem(status, status === "open" ? null : new Date().toISOString());
    setPendingItemIds((prev) => new Set(prev).add(item.id));
    startStatus(async () => {
      const result = await setRecommendationStatus(clientId, item.id, status);
      setPendingItemIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      if (result.error) {
        setItem(previous, item.statusAt);
        toast({ variant: "error", title: "Couldn't save that", description: result.error });
      }
    });
  }

  async function copyList(row: SeoRecommendationRow) {
    try {
      await navigator.clipboard.writeText(recommendationsAsText(row.clientName, row.items ?? []));
      toast({ variant: "success", title: "Copied", description: "Paste it into an email, Slack or your task list." });
    } catch {
      toast({ variant: "error", title: "Couldn't copy", description: "Your browser blocked the clipboard." });
    }
  }

  const missingIds = rows.filter((r) => r.items === null).map((r) => r.clientId);
  const staleIds = rows.filter((r) => isStale(r, now)).map((r) => r.clientId);
  const selectedOpen = selected ? openItems(selected) : [];
  const selectedClosed = selected ? (selected.items ?? []).filter((item) => item.status !== "open") : [];
  const selectedTotal = selected?.items?.filter((item) => item.status !== "dismissed").length ?? 0;
  const selectedDone = selected?.items?.filter((item) => item.status === "done").length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">
            {counts.missing > 0
              ? `${rows.length - counts.missing} of ${rows.length} clients have a to-do list`
              : `All ${rows.length} clients have a to-do list`}
          </p>
          <p className="text-xs text-muted-foreground">
            {counts.open} open · <span className={cn(counts.openHigh > 0 && "font-medium text-destructive")}>{counts.openHigh} high priority</span> ·{" "}
            {counts.done} done
            {counts.stale > 0 && ` · ${counts.stale} older than ${STALE_DAYS} days`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bulk ? (
            <>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <SparklesIcon className="size-3.5 animate-pulse text-primary" aria-hidden />
                {bulk.label} {bulk.done} of {bulk.total}…
              </span>
              <Button size="sm" variant="outline" onClick={() => (cancelBulk.current = true)}>
                Stop
              </Button>
            </>
          ) : (
            <>
              {staleIds.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => runBulk(staleIds, "Refreshing")}>
                  <RefreshCwIcon className="size-3.5" aria-hidden />
                  Refresh {staleIds.length} out of date
                </Button>
              )}
              <Button size="sm" onClick={() => runBulk(missingIds, "Writing")} disabled={missingIds.length === 0}>
                <SparklesIcon className="size-3.5" aria-hidden />
                {missingIds.length > 0 ? `Write ${missingIds.length} missing` : "None missing"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedFilter
          ariaLabel="Filter recommendations"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "high", label: "High priority open", count: counts.high, alert: true },
            { value: "missing", label: "Not written", count: counts.missing },
            { value: "stale", label: "Out of date", count: counts.stale },
          ]}
        />
        <div className="relative w-full lg:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="h-9 bg-card pl-8"
            aria-label="Search clients"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Client", "Tier", "Top to-do", "Progress", "Written"].map((head) => (
                <TableHead key={head} className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {head}
                </TableHead>
              ))}
              <TableHead className="h-9 w-28 bg-muted/40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No clients match.
                </TableCell>
              </TableRow>
            )}
            {visible.map((row) => {
              const isGenerating = generatingIds.has(row.clientId);
              const failed = failedIds.has(row.clientId);
              const open = openItems(row);
              const top = open[0];
              const total = row.items?.filter((item) => item.status !== "dismissed").length ?? 0;
              const done = row.items?.filter((item) => item.status === "done").length ?? 0;
              const stale = isStale(row, now);
              return (
                <TableRow
                  key={row.clientId}
                  className={cn("h-14", row.items && "cursor-pointer")}
                  onClick={() => row.items && setSelectedId(row.clientId)}
                >
                  <TableCell className="font-medium text-foreground">{row.clientName}</TableCell>
                  <TableCell>
                    <TierBadge tier={row.tier} />
                  </TableCell>
                  <TableCell className="max-w-[28rem]">
                    {isGenerating ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <SparklesIcon className="size-3.5 animate-pulse text-primary" aria-hidden />
                        Writing…
                      </span>
                    ) : failed ? (
                      <span className="text-sm text-destructive">Couldn&apos;t write this one — try again</span>
                    ) : top ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_STYLE[top.priority].dot)} title={`${PRIORITY_LABELS[top.priority]} priority`} />
                        <span className="truncate text-sm text-foreground">{shortenUrls(top.title)}</span>
                        {open.length > 1 && <span className="shrink-0 text-xs text-muted-foreground">+{open.length - 1} more</span>}
                      </div>
                    ) : row.items ? (
                      <span className="flex items-center gap-1.5 text-sm text-success">
                        <ListChecksIcon className="size-3.5" aria-hidden />
                        All done
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/70">Not written yet</span>
                    )}
                  </TableCell>
                  <TableCell>{row.items ? <ProgressBar done={done} total={total} /> : <span className="text-muted-foreground/50">—</span>}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {row.generatedAt ? (
                      <span className={stale ? "font-medium text-warning" : "text-muted-foreground"}>
                        {formatRelativeTime(new Date(row.generatedAt), now)}
                        {stale && " · out of date"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={row.items ? "ghost" : "outline"}
                      disabled={isGenerating || bulk !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        regenerate(row.clientId);
                      }}
                    >
                      {row.items ? (
                        <RefreshCwIcon className={isGenerating ? "size-3 animate-spin" : "size-3"} aria-hidden />
                      ) : (
                        <SparklesIcon className="size-3" aria-hidden />
                      )}
                      {row.items ? "Rewrite" : "Write"}
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
          <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:w-[min(48rem,94vw)] data-[side=right]:sm:max-w-none" side="right">
            <SheetHeader className="gap-2 border-b border-border">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <SheetTitle className="text-lg">{selected.clientName}</SheetTitle>
                <TierBadge tier={selected.tier} />
              </div>
              <SheetDescription>
                SEO to-do list · written {selected.generatedAt ? formatRelativeTime(new Date(selected.generatedAt), new Date()) : "—"}
                {isStale(selected, now) && " · out of date, worth rewriting"}
              </SheetDescription>
              <SourcesLine sources={selected.sources} />
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <ProgressBar done={selectedDone} total={selectedTotal} />
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyList(selected)}>
                    <ClipboardCopyIcon className="size-3.5" />
                    Copy list
                  </Button>
                  <Button size="sm" variant="outline" disabled={generatingIds.has(selected.clientId)} onClick={() => regenerate(selected.clientId)}>
                    <RefreshCwIcon className={generatingIds.has(selected.clientId) ? "size-3.5 animate-spin" : "size-3.5"} />
                    {generatingIds.has(selected.clientId) ? "Writing…" : "Rewrite"}
                  </Button>
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4 pb-8">
              {selectedOpen.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
                  <ListChecksIcon className="size-6 text-success" />
                  <p className="text-sm font-medium text-foreground">Everything on this list is handled</p>
                  <p className="text-xs text-muted-foreground">Rewrite it for fresh ideas — finished items won&apos;t be suggested again.</p>
                </div>
              ) : (
                (["high", "medium", "low"] as RecPriority[]).map((priority) => {
                  const group = selectedOpen.filter((item) => item.priority === priority);
                  if (group.length === 0) return null;
                  return (
                    <section key={priority} className="flex flex-col gap-2">
                      <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        <span className={cn("size-2 rounded-full", PRIORITY_STYLE[priority].dot)} />
                        {PRIORITY_LABELS[priority]} priority · {group.length}
                      </h3>
                      <ul className="flex flex-col gap-2">
                        {group.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            pending={pendingItemIds.has(item.id)}
                            onStatus={(status) => updateStatus(selected.clientId, item, status)}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}

              {selectedClosed.length > 0 && (
                <details className="group flex flex-col gap-2">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground">
                    <NotebookPenIcon className="size-3.5" />
                    Done and dismissed · {selectedClosed.length}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {selectedClosed.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        pending={pendingItemIds.has(item.id)}
                        onStatus={(status) => updateStatus(selected.clientId, item, status)}
                      />
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
