import "server-only";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { format, parseISO, subDays } from "date-fns";
import { getDb } from "../db";
import { openAiJson } from "../ai/openai";
import { clientAnalyses, clientPlatformAccounts, clients, metricSnapshots } from "../db/schema";
import { PLATFORM_ORDER } from "../connectors/platform-labels";
import type { Platform } from "../connectors/types";
import { allRecommendations, formatFactValue as fmt } from "./format";
import { buildLeadFunnel } from "./leads";
import { buildPlatformFacts, periodsFor, type SnapshotLike } from "./facts";
import type {
  AnalysisHistoryEntry,
  AnalysisKind,
  AnalysisRecommendation,
  ClientFacts,
  MetricFact,
  PlatformFacts,
  StoredAnalysis,
} from "./types";

const PLATFORMS = ["lead_dashboard", "ghl", "openphone", "google_ads", "meta", "ga4", "search_console", "ahrefs"] as const;

const recommendationSchema = z.object({
  title: z.string().describe("The action, one short imperative sentence under 15 words."),
  detail: z.string().describe("Two or three sentences: why (citing the numbers) and exactly what to do."),
  priority: z.enum(["high", "medium", "low"]),
  impact: z.string().describe("Expected result in a few words, e.g. 'Lower cost per lead' or '+10-20 leads a month'."),
  effort: z.enum(["quick", "medium", "big"]).describe("quick = under an hour, medium = a few hours, big = a project"),
});

const outputSchema = z.object({
  healthScore: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("0-100. 80+ healthy and growing, 60-79 fine with things to watch, 40-59 needs work, under 40 serious problems."),
  headline: z.string().describe("One sentence, under 20 words: the single most important thing about this client right now."),
  summary: z.string().describe("Two or three sentences for the account manager, citing the key numbers."),
  accounts: z
    .array(
      z.object({
        platform: z.enum(PLATFORMS),
        status: z.enum(["good", "watch", "problem"]),
        headline: z.string().describe("Under 15 words."),
        whatChanged: z.string().describe("One or two sentences with the actual numbers and % changes given."),
        likelyCauses: z.array(z.string()).max(3).describe("Plausible reasons, each one short sentence. Say 'likely' or 'possibly' — never state a guess as fact."),
        recommendations: z.array(recommendationSchema).max(4),
      }),
    )
    .describe("One entry per account in the data, in the same order."),
  leads: z
    .object({
      headline: z.string().describe("Under 15 words: the state of this client's leads."),
      whatChanged: z
        .string()
        .describe("Two or three sentences on the lead funnel: volume, completion and spam, calls answered vs missed, blended cost per lead, using the numbers given."),
      insights: z
        .array(z.string())
        .max(4)
        .describe("Specific observations about where leads come from and when — channels growing or shrinking, weekday patterns, lost leads (abandoned forms, missed calls)."),
      recommendations: z.array(recommendationSchema).max(4).describe("How to get more, better or cheaper leads."),
    })
    .nullable()
    .describe("The leads section, from the 'Leads across all accounts' data. null only if that section is missing."),
  crossChannel: z
    .array(z.object({ title: z.string(), detail: z.string() }))
    .max(4)
    .describe("Connections between accounts a single-account view would miss, e.g. ad spend up but leads flat."),
});

function describeMetric(m: MetricFact): string {
  const change = m.change === null ? "" : ` (${m.change >= 0 ? "+" : ""}${Math.round(m.change * 100)}%${m.lowerIsBetter ? ", lower is better" : ""})`;
  return `${m.label}: ${fmt(m, m.current)} vs ${fmt(m, m.previous)} before${change}`;
}

export function factsToPrompt(facts: ClientFacts): string {
  const lines = [
    `Client: ${facts.clientName}`,
    `Period analysed: ${facts.period.label} (${facts.period.start} to ${facts.period.end}), compared with ${facts.previousPeriod.start} to ${facts.previousPeriod.end}.`,
  ];
  if (facts.leads) {
    const l = facts.leads;
    lines.push("", "## Leads across all accounts");
    lines.push(`Lead count comes from: ${l.source === "lead_dashboard" ? "Lead Dashboard (website form leads)" : l.source === "ghl" ? "GoHighLevel new opportunities" : "no lead source connected"}.`);
    for (const m of l.metrics) lines.push(`- ${describeMetric(m)}`);
    if (l.channels.length > 0) {
      lines.push("Lead channels (each platform's own count, so they overlap and don't add up to total leads):");
      for (const c of l.channels) {
        const change = c.change === null ? "" : ` (${c.change >= 0 ? "+" : ""}${Math.round(c.change * 100)}%)`;
        lines.push(`- ${c.label}: ${c.current === null ? "no data" : Math.round(c.current)} vs ${c.previous === null ? "no data" : Math.round(c.previous)} before${change}`);
      }
    }
    const withLeads = l.weekdays.some((d) => d.leads !== null);
    const withCalls = l.weekdays.some((d) => d.calls !== null);
    if (withLeads || withCalls) {
      lines.push(
        `By weekday this period: ${l.weekdays
          .map((d) => `${d.day} ${[withLeads ? `${Math.round(d.leads ?? 0)} leads` : null, withCalls ? `${Math.round(d.calls ?? 0)} calls (${Math.round(d.missedCalls ?? 0)} missed)` : null].filter(Boolean).join(", ")}`)
          .join("; ")}.`,
      );
    }
  }
  for (const p of facts.platforms) {
    lines.push("", `## ${p.label} (platform id: ${p.platform})`);
    if (p.problem) lines.push(`Problem: ${p.problem}`);
    lines.push(`Days with data: ${p.daysWithData} this period, ${p.previousDaysWithData} before.`);
    for (const m of p.metrics) lines.push(`- ${describeMetric(m)}`);
    for (const note of p.notes) lines.push(`- ${note}`);
    if (p.weekly && p.weekly.values.some((v) => v !== null)) {
      lines.push(`- ${p.weekly.label}, last 13 weeks oldest first: ${p.weekly.values.map((v) => (v === null ? "–" : Math.round(v))).join(", ")}`);
    }
  }
  if (facts.quietAccounts.length > 0) lines.push("", `Connected but no data this period: ${facts.quietAccounts.join(", ")}.`);
  return lines.join("\n");
}

export async function buildClientFacts(clientId: string, kind: AnalysisKind, now: Date): Promise<ClientFacts> {
  const db = await getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) throw new Error("Client not found");

  const { current, previous } = periodsFor(kind, now, client.timezone);
  const mappings = await db
    .select()
    .from(clientPlatformAccounts)
    .where(and(eq(clientPlatformAccounts.clientId, clientId), eq(clientPlatformAccounts.active, true)));
  const excluded = new Set<string>(client.excludedPlatforms ?? []);
  const platforms = PLATFORM_ORDER.filter((p) => mappings.some((m) => m.platform === p) && !excluded.has(p));

  // 13 weeks of history for the weekly trend, plus Ahrefs' monthly rows.
  const since = format(subDays(parseISO(current.end), 13 * 7 + 62), "yyyy-MM-dd");
  const rows = platforms.length
    ? await db
        .select({ platform: metricSnapshots.platform, date: metricSnapshots.date, metrics: metricSnapshots.metrics })
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.clientId, clientId),
            inArray(metricSnapshots.platform, platforms),
            gte(metricSnapshots.date, since),
            lte(metricSnapshots.date, current.end),
          ),
        )
    : [];

  const byPlatform = new Map<Platform, SnapshotLike[]>();
  for (const row of rows) {
    const list = byPlatform.get(row.platform) ?? [];
    list.push({ date: row.date, metrics: row.metrics });
    byPlatform.set(row.platform, list);
  }

  const facts: PlatformFacts[] = [];
  const quiet: string[] = [];
  for (const platform of platforms) {
    const pf = buildPlatformFacts(platform, byPlatform.get(platform) ?? [], current, previous);
    const mapping = mappings.find((m) => m.platform === platform);
    if (mapping?.verifiedStatus === "error") pf.problem = `The last account check failed${mapping.lastError ? `: ${mapping.lastError}` : ""}.`;
    if (pf.daysWithData === 0) quiet.push(pf.label);
    facts.push(pf);
  }

  return {
    clientId,
    clientName: client.name,
    period: current,
    previousPeriod: previous,
    platforms: facts.filter((p) => p.daysWithData > 0 || p.previousDaysWithData > 0 || p.problem),
    quietAccounts: quiet,
    leads: buildLeadFunnel(byPlatform, platforms, current, previous),
  };
}

// Done/dismissed items from the client's latest report (and that report's
// own history), newest first, so the next report doesn't repeat them.
export async function previousHistory(clientId: string): Promise<AnalysisHistoryEntry[]> {
  const db = await getDb();
  const [latest] = await db
    .select({ report: clientAnalyses.report })
    .from(clientAnalyses)
    .where(eq(clientAnalyses.clientId, clientId))
    .orderBy(desc(clientAnalyses.generatedAt))
    .limit(1);
  if (!latest) return [];
  const report = latest.report as StoredAnalysis;
  const fresh: AnalysisHistoryEntry[] = [];
  for (const rec of allRecommendations(report)) {
    if (rec.status === "done" || rec.status === "dismissed") fresh.push({ title: rec.title, status: rec.status, at: rec.statusAt ?? new Date().toISOString() });
  }
  return [...fresh, ...(report.history ?? [])].slice(0, 40);
}

export async function generateClientAnalysis(
  clientId: string,
  { kind, createdBy, now = new Date() }: { kind: AnalysisKind; createdBy: string; now?: Date },
): Promise<{ id: string; report: StoredAnalysis }> {
  const facts = await buildClientFacts(clientId, kind, now);
  const history = await previousHistory(clientId);

  if (facts.platforms.length === 0) {
    throw new Error("No numbers to analyse yet — connect this client's accounts and let them update first.");
  }

  const prompt = [factsToPrompt(facts)];
  const done = history.filter((h) => h.status === "done").slice(0, 20);
  const dismissed = history.filter((h) => h.status === "dismissed").slice(0, 20);
  if (done.length > 0) prompt.push("", `Already done by the team — don't suggest again: ${done.map((h) => `"${h.title}"`).join("; ")}.`);
  if (dismissed.length > 0) prompt.push("", `Turned down by the team — don't suggest these or close variations: ${dismissed.map((h) => `"${h.title}"`).join("; ")}.`);

  // OpenAI with the team's own key (lib/ai/openai.ts).
  const { output, model } = await openAiJson({
    schema: outputSchema,
    instructions:
      "You are a senior digital-marketing strategist reviewing one client for the agency team that manages it " +
      "(internal, not client-facing). You are given numbers already computed from the client's connected accounts. " +
      "Only use numbers that are given — never invent or estimate one, and treat 'no data' as unknown, not zero. " +
      "For each account: say what changed, why it likely changed, and what the team should do in that platform. " +
      "Recommendations must be specific and actionable (e.g. 'Add negative keywords for job-seeker searches in Google Ads'), " +
      "never generic advice like 'improve your ads'. Fewer, sharper recommendations beat many vague ones; an account that's " +
      "doing well can have zero. Mark at most three recommendations high priority across the whole report. Then look across " +
      "accounts for connections (spend vs leads, calls vs leads, search traffic vs conversions). Leads are what the client " +
      "pays for, so the leads section matters most: explain the funnel (volume, completed vs abandoned forms, spam, answered " +
      "vs missed calls, blended cost per lead), which channels are driving or losing leads, and weekday patterns, then give " +
      "concrete ways to get more, better or cheaper leads. Plain words, no filler.",
    prompt: prompt.join("\n"),
  });

  const batch = Date.now().toString(36);
  const known = new Set(facts.platforms.map((p) => p.platform));
  const toRecommendation = (prefix: string) => (r: z.infer<typeof recommendationSchema>, i: number): AnalysisRecommendation => ({
    id: `${batch}-${prefix}-${i}`,
    title: r.title.trim(),
    detail: r.detail.trim(),
    priority: r.priority,
    impact: r.impact.trim(),
    effort: r.effort,
    status: "open",
    statusAt: null,
  });
  const report: StoredAnalysis = {
    version: 1,
    healthScore: Math.round(output.healthScore),
    headline: output.headline.trim(),
    summary: output.summary.trim(),
    accounts: output.accounts
      .filter((a) => known.has(a.platform))
      .map((a, ai) => ({
        platform: a.platform,
        status: a.status,
        headline: a.headline.trim(),
        whatChanged: a.whatChanged.trim(),
        likelyCauses: a.likelyCauses.map((c) => c.trim()).filter(Boolean),
        recommendations: a.recommendations.filter((r) => r.title.trim() !== "").map(toRecommendation(String(ai))),
      })),
    leads:
      output.leads && facts.leads
        ? {
            headline: output.leads.headline.trim(),
            whatChanged: output.leads.whatChanged.trim(),
            insights: output.leads.insights.map((x) => x.trim()).filter(Boolean),
            recommendations: output.leads.recommendations.filter((r) => r.title.trim() !== "").map(toRecommendation("leads")),
          }
        : null,
    crossChannel: output.crossChannel.map((c) => ({ title: c.title.trim(), detail: c.detail.trim() })),
    facts,
    history,
    model,
  };

  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(clientAnalyses).values({
    id,
    clientId,
    kind,
    periodStart: facts.period.start,
    periodEnd: facts.period.end,
    healthScore: report.healthScore,
    report,
    createdBy,
    generatedAt: now,
  });
  return { id, report };
}
