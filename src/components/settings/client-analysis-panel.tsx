"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  CircleDotIcon,
  LinkIcon,
  Loader2Icon,
  MinusIcon,
  RotateCcwIcon,
  SparklesIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { setAnalysisRecommendationStatus } from "@/app/settings/analysis-actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { PLATFORM_LABELS } from "@/lib/connectors/platform-labels";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { allRecommendations, changeTone, formatChange, formatFactValue, mapRecommendations } from "@/lib/analysis/format";
import type {
  AccountAnalysis,
  AnalysisListEntry,
  AnalysisRecommendation,
  AnalysisRow,
  LeadFunnelFacts,
  LeadsAnalysis,
  MetricFact,
  RecommendationStatus,
} from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<AccountAnalysis["status"], { label: string; className: string }> = {
  good: { label: "Going well", className: "bg-success/10 text-success" },
  watch: { label: "Watch", className: "bg-warning/15 text-warning" },
  problem: { label: "Needs work", className: "bg-destructive/10 text-destructive" },
};

const PRIORITY_STYLE: Record<AnalysisRecommendation["priority"], string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning/15 text-warning",
  low: "bg-muted text-muted-foreground",
};

const EFFORT_LABEL: Record<AnalysisRecommendation["effort"], string> = {
  quick: "Quick win",
  medium: "A few hours",
  big: "Project",
};

export function scoreTone(score: number) {
  return score >= 80
    ? { ring: "stroke-success", text: "text-success", label: "Healthy" }
    : score >= 60
      ? { ring: "stroke-primary", text: "text-primary", label: "Fine, with things to watch" }
      : score >= 40
        ? { ring: "stroke-warning", text: "text-warning", label: "Needs work" }
        : { ring: "stroke-destructive", text: "text-destructive", label: "Serious problems" };
}

function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex size-24 shrink-0 items-center justify-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className={cn("fill-none transition-all", tone.ring)}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
        />
      </svg>
      <div className="flex flex-col items-center leading-none">
        <span className={cn("font-heading text-2xl font-semibold tabular-nums", tone.text)}>{score}</span>
        <span className="mt-1 text-[10px] text-muted-foreground">of 100</span>
      </div>
    </div>
  );
}

function periodName(entry: Pick<AnalysisListEntry, "kind" | "periodStart" | "periodEnd" | "generatedAt">) {
  const start = new Date(`${entry.periodStart}T00:00:00Z`);
  if (entry.kind === "monthly") {
    return `${start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} · monthly`;
  }
  return `${new Date(entry.generatedAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })} · on demand`;
}

function Recommendation({
  rec,
  onStatus,
  busy,
}: {
  rec: AnalysisRecommendation;
  onStatus: (status: RecommendationStatus) => void;
  busy: boolean;
}) {
  const closed = rec.status !== "open";
  return (
    <li className={cn("flex flex-col gap-1.5 rounded-lg border border-border bg-background/60 p-3", closed && "opacity-60")}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase", PRIORITY_STYLE[rec.priority])}>
              {rec.priority}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{EFFORT_LABEL[rec.effort]}</span>
            {rec.status === "done" && <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">Done</span>}
            {rec.status === "dismissed" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Dismissed</span>
            )}
          </div>
          <span className={cn("text-sm font-medium text-foreground", closed && "line-through decoration-muted-foreground/50")}>{rec.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {closed ? (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onStatus("open")}>
              <RotateCcwIcon className="size-3.5" />
              Reopen
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onStatus("done")}>
                <CheckIcon className="size-3.5" />
                Done
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7 text-muted-foreground"
                disabled={busy}
                onClick={() => onStatus("dismissed")}
                aria-label="Dismiss"
                title="Not doing this"
              >
                <XIcon className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{rec.detail}</p>
      {rec.impact && <p className="text-xs font-medium text-foreground/80">Expected: {rec.impact}</p>}
    </li>
  );
}

function MetricTile({ m }: { m: MetricFact }) {
  const tone = changeTone(m);
  const change = formatChange(m.change);
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-2.5 py-2">
      <span className="truncate text-[11px] text-muted-foreground" title={m.label}>
        {m.label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold text-foreground tabular-nums">{formatFactValue(m, m.current)}</span>
        {change && (
          <span
            className={cn(
              "flex items-center text-[11px] font-medium tabular-nums",
              tone === "good" && "text-success",
              tone === "bad" && "text-destructive",
              tone === "flat" && "text-muted-foreground",
            )}
          >
            {tone === "flat" ? (
              <MinusIcon className="size-3" />
            ) : (m.change ?? 0) > 0 ? (
              <ArrowUpRightIcon className="size-3" />
            ) : (
              <ArrowDownRightIcon className="size-3" />
            )}
            {change}
          </span>
        )}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</span>;
}

// Leads across every account: the funnel, where they come from, and which
// weekdays bring them — then the AI's read and what to do about it.
function LeadsSection({
  facts,
  analysis,
  onStatus,
  busyId,
}: {
  facts: LeadFunnelFacts;
  analysis: LeadsAnalysis | null | undefined;
  onStatus: (rec: AnalysisRecommendation, status: RecommendationStatus) => void;
  busyId: string | null;
}) {
  const maxChannel = Math.max(1, ...facts.channels.map((c) => c.current ?? 0));
  const hasLeadDays = facts.weekdays.some((d) => d.leads !== null);
  const hasCallDays = facts.weekdays.some((d) => d.calls !== null);
  const maxDay = Math.max(1, ...facts.weekdays.map((d) => Math.max(d.leads ?? 0, d.missedCalls ?? 0)));
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-success/25 bg-success/[0.03] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-heading text-sm font-semibold text-foreground">
          <span className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success">
            <UsersIcon className="size-3.5" />
          </span>
          Leads
        </h4>
        <span className="text-[11px] text-muted-foreground">
          {facts.source === "lead_dashboard" ? "Lead count from Lead Dashboard" : facts.source === "ghl" ? "Lead count from GoHighLevel" : "No lead source connected"}
        </span>
      </header>

      {analysis && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{analysis.headline}</p>
          <p className="text-sm text-muted-foreground">{analysis.whatChanged}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {facts.metrics.map((m) => (
          <MetricTile key={m.label} m={m} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {facts.channels.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Where leads come from</SectionLabel>
            <ul className="flex flex-col gap-1.5">
              {facts.channels.map((c) => {
                const change = formatChange(c.change);
                return (
                  <li key={c.label} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate text-foreground">{c.label}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        <span className="font-semibold text-foreground">{c.current === null ? "–" : Math.round(c.current).toLocaleString("en-US")}</span>
                        {change && (
                          <span className={cn("ml-1.5", (c.change ?? 0) >= 0 ? "text-success" : "text-destructive")}>{change}</span>
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-success/70" style={{ width: `${((c.current ?? 0) / maxChannel) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-muted-foreground">Each platform counts its own way, so these overlap rather than add up.</p>
          </div>
        )}
        {(hasLeadDays || hasCallDays) && (
          <div className="flex flex-col gap-2">
            <SectionLabel>By day of the week</SectionLabel>
            <div className="flex h-28 items-end gap-2">
              {facts.weekdays.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-20 w-full items-end justify-center gap-0.5">
                    {hasLeadDays && (
                      <div
                        className="w-2.5 rounded-t bg-success/70"
                        style={{ height: `${((d.leads ?? 0) / maxDay) * 100}%` }}
                        title={`${d.day}: ${Math.round(d.leads ?? 0)} leads`}
                      />
                    )}
                    {hasCallDays && (
                      <div
                        className="w-2.5 rounded-t bg-destructive/60"
                        style={{ height: `${((d.missedCalls ?? 0) / maxDay) * 100}%` }}
                        title={`${d.day}: ${Math.round(d.missedCalls ?? 0)} missed of ${Math.round(d.calls ?? 0)} calls`}
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{d.day}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              {hasLeadDays && (
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-success/70" /> Leads
                </span>
              )}
              {hasCallDays && (
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-sm bg-destructive/60" /> Missed calls
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {analysis && analysis.insights.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionLabel>What stands out</SectionLabel>
          <ul className="flex flex-col gap-1">
            {analysis.insights.map((insight) => (
              <li key={insight} className="flex gap-2 text-sm text-muted-foreground">
                <CircleDotIcon className="mt-1 size-3 shrink-0 text-success/70" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
      {analysis && analysis.recommendations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <SectionLabel>How to get more leads</SectionLabel>
          <ul className="grid gap-2 lg:grid-cols-2">
            {analysis.recommendations.map((rec) => (
              <Recommendation key={rec.id} rec={rec} busy={busyId === rec.id} onStatus={(s) => onStatus(rec, s)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AccountCard({
  account,
  analysis,
  onStatus,
  busyId,
}: {
  account: AccountAnalysis;
  analysis: AnalysisRow;
  onStatus: (rec: AnalysisRecommendation, status: RecommendationStatus) => void;
  busyId: string | null;
}) {
  const facts = analysis.report.facts.platforms.find((p) => p.platform === account.platform);
  const status = STATUS_STYLE[account.status];
  const shown = (facts?.metrics ?? []).filter((m) => m.current !== null).slice(0, 4);
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-heading text-sm font-semibold text-foreground">{PLATFORM_LABELS[account.platform]}</h4>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status.className)}>{status.label}</span>
      </header>
      {shown.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {shown.map((m) => (
            <MetricTile key={m.label} m={m} />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{account.headline}</p>
        <p className="text-sm text-muted-foreground">{account.whatChanged}</p>
      </div>
      {account.likelyCauses.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Likely why</span>
          <ul className="flex flex-col gap-1">
            {account.likelyCauses.map((cause) => (
              <li key={cause} className="flex gap-2 text-sm text-muted-foreground">
                <CircleDotIcon className="mt-1 size-3 shrink-0 text-muted-foreground/60" />
                {cause}
              </li>
            ))}
          </ul>
        </div>
      )}
      {account.recommendations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">What to do</span>
          <ul className="flex flex-col gap-2">
            {account.recommendations.map((rec) => (
              <Recommendation key={rec.id} rec={rec} busy={busyId === rec.id} onStatus={(s) => onStatus(rec, s)} />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

// Settings → a client's page: the AI analysis for this client — latest by
// default, earlier ones from the picker — with "Analyse now" and the
// recommendation checklist.
export function ClientAnalysisPanel({
  clientId,
  analyses,
  current,
  aiConfigured,
}: {
  clientId: string;
  analyses: AnalysisListEntry[];
  current: AnalysisRow | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(current?.report ?? null);
  const [reportId, setReportId] = useState(current?.id ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // A different report was picked or a new one generated: show it.
  if (current && current.id !== reportId) {
    setReportId(current.id);
    setReport(current.report);
  }

  async function analyse() {
    setRunning(true);
    try {
      const response = await fetch("/api/analysis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; healthScore?: number };
      if (!response.ok) {
        toast({ variant: "error", title: "Analysis not run", description: body.error ?? "Please try again." });
        return;
      }
      toast({ variant: "success", title: `Analysis ready · health ${body.healthScore}/100` });
      router.replace(`${pathname}#analysis`, { scroll: false });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Analysis not run", description: "Couldn't reach the server. Please try again." });
    } finally {
      setRunning(false);
    }
  }

  function setStatus(rec: AnalysisRecommendation, status: RecommendationStatus) {
    if (!current || !report) return;
    const previous = report;
    setBusyId(rec.id);
    setReport(
      mapRecommendations(report, (r) =>
        r.id === rec.id ? { ...r, status, statusAt: status === "open" ? null : new Date().toISOString() } : r,
      ),
    );
    startTransition(async () => {
      const result = await setAnalysisRecommendationStatus(current.id, rec.id, status);
      if (result.error) {
        setReport(previous);
        toast({ variant: "error", title: "Not saved", description: result.error });
      }
      setBusyId(null);
    });
  }

  const openCount = report ? allRecommendations(report).filter((r) => r.status === "open").length : 0;
  const tone = report ? scoreTone(report.healthScore) : null;

  return (
    <section id="analysis" className="flex scroll-mt-6 flex-col gap-4 rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SparklesIcon className="size-4" />
          </span>
          <div className="flex flex-col">
            <h3 className="font-heading text-base font-semibold text-foreground">AI analysis</h3>
            <span className="text-xs text-muted-foreground">
              {current
                ? `${current.report.facts.period.label} vs the period before · written ${formatRelativeTime(new Date(current.generatedAt), new Date())}`
                : "Every account reviewed together, with what to do next. Runs monthly, or any time on demand."}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {analyses.length > 0 && (
            <Select
              value={current?.id}
              onValueChange={(id) => router.push(`${pathname}?analysis=${id}#analysis`, { scroll: false })}
            >
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue placeholder="Earlier reports" />
              </SelectTrigger>
              <SelectContent>
                {analyses.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {periodName(a)} · {a.healthScore}/100
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={analyse} disabled={running || !aiConfigured} title={aiConfigured ? undefined : "OPENAI_API_KEY isn't set in Vercel"}>
            {running ? <Loader2Icon className="size-3.5 animate-spin" /> : <SparklesIcon className="size-3.5" />}
            {running ? "Analysing… (about 20s)" : current ? "Analyse now" : "Run first analysis"}
          </Button>
        </div>
      </header>

      {!current || !report ? (
        <div className="flex flex-col items-center gap-2 px-5 pb-8 pt-4 text-center">
          <p className="max-w-lg text-sm text-muted-foreground">
            No analysis yet. One runs automatically for every client on the 2nd of each month, covering the month
            before. Or click <strong>Run first analysis</strong> to review the last 30 days now.
          </p>
          {!aiConfigured && <p className="text-xs text-destructive">OPENAI_API_KEY isn&apos;t set in Vercel, so analysis can&apos;t run yet.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-5 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ScoreRing score={report.healthScore} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className={cn("text-xs font-semibold tracking-wide uppercase", tone?.text)}>{tone?.label}</span>
              <p className="font-heading text-lg leading-snug font-medium text-foreground">{report.headline}</p>
              <p className="text-sm text-muted-foreground">{report.summary}</p>
              <p className="text-xs text-muted-foreground">
                {openCount} open {openCount === 1 ? "recommendation" : "recommendations"} · {current.kind === "monthly" ? "Monthly report" : `On demand, by ${current.createdBy}`}
              </p>
            </div>
          </div>

          {report.facts.leads && (
            <LeadsSection facts={report.facts.leads} analysis={report.leads} busyId={busyId} onStatus={setStatus} />
          )}

          {report.crossChannel.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
                <LinkIcon className="size-3.5" />
                Across accounts
              </span>
              <ul className="flex flex-col gap-2">
                {report.crossChannel.map((insight) => (
                  <li key={insight.title} className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{insight.title}</span>
                    <span className="text-sm text-muted-foreground">{insight.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {report.accounts.map((account) => (
              <AccountCard
                key={account.platform}
                account={account}
                analysis={{ ...current, report }}
                busyId={busyId}
                onStatus={setStatus}
              />
            ))}
          </div>

          {report.facts.quietAccounts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              No numbers for this period from: {report.facts.quietAccounts.join(", ")}.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Written by AI{report.model ? ` (${report.model})` : ""} from this client&apos;s synced numbers. Every figure above is
            calculated by the dashboard, not the AI. Done and dismissed items are remembered so the next report doesn&apos;t repeat them.
          </p>
        </div>
      )}
    </section>
  );
}
