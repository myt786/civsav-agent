import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getDb } from "../db";
import { clientPlatformAccounts } from "../db/schema";
import { fetchGscBreakdown } from "../connectors/search-console/client";
import { fetchSitemapUrls } from "./sitemap";
import { getSeoClientSnapshot, getSeoNotesHistory } from "./queries";
import { formatInteger, formatPercent, formatPosition } from "../dashboard/format";
import type { SeoClientRow } from "./types";

const NARRATIVE_MODEL = "google/gemini-2.5-flash-lite";

const recommendationsOutputSchema = z.object({
  recommendations: z
    .array(z.string().describe("One concrete, specific SEO recommendation — reference an actual page or query from the data given where relevant, not a generic tip."))
    .min(4)
    .max(8),
});

export interface ClientRecommendationResult {
  recommendations: string[];
  sitemapUrlCount: number | null;
}

function summarizeRow(row: SeoClientRow): string {
  const parts: string[] = [];
  const newest = row.months[row.months.length - 1];
  if (newest?.clicks.kind === "ok" || newest?.clicks.kind === "unverified") {
    parts.push(`clicks this month: ${formatInteger(newest.clicks.value)}`);
  }
  if (newest?.avgPosition.kind === "ok" || newest?.avgPosition.kind === "unverified") {
    parts.push(`avg. search position: ${formatPosition(newest.avgPosition.value)}`);
  }
  parts.push(`tier: ${row.tier}, trend: ${row.trend}`);
  if (row.momPct !== null) parts.push(`month-over-month clicks change: ${formatPercent(row.momPct * 100)}`);
  if (row.organicKeywords.kind === "ok" || row.organicKeywords.kind === "unverified") {
    parts.push(`organic keywords tracked (Ahrefs): ${formatInteger(row.organicKeywords.value)}`);
  }
  if (row.keywordsGained.kind === "ok" || row.keywordsGained.kind === "unverified") {
    parts.push(`keywords gained this month: ${row.keywordsGained.value}`);
  }
  if (row.keywordsLost.kind === "ok" || row.keywordsLost.kind === "unverified") {
    parts.push(`keywords lost this month: ${row.keywordsLost.value}`);
  }
  if (row.newReferringDomains !== null) parts.push(`new referring domains this month: ${row.newReferringDomains}`);
  return parts.length > 0 ? parts.join(", ") : "no connector data has synced for this client yet";
}

// Gathers everything, best-effort — a missing piece (no sitemap, no GSC
// access yet, no history) degrades to "less context for the model," never
// blocks the others or throws. This feeds a prompt, not a sync pipeline.
export async function generateClientRecommendation(clientId: string): Promise<ClientRecommendationResult> {
  const db = await getDb();

  const row = await getSeoClientSnapshot(clientId);
  if (!row) throw new Error("Client not found");

  const [mappings, notesHistory] = await Promise.all([
    db
      .select()
      .from(clientPlatformAccounts)
      .where(and(eq(clientPlatformAccounts.clientId, clientId), inArray(clientPlatformAccounts.platform, ["ahrefs", "search_console"]))),
    getSeoNotesHistory(clientId),
  ]);

  const ahrefsDomain = mappings.find((m) => m.platform === "ahrefs")?.externalId ?? null;
  const gscSiteUrl = mappings.find((m) => m.platform === "search_console")?.externalId ?? null;

  const [sitemapResult, gscBreakdown] = await Promise.all([
    ahrefsDomain ? fetchSitemapUrls(ahrefsDomain) : Promise.resolve<{ status: "no_data" }>({ status: "no_data" }),
    gscSiteUrl ? fetchGscBreakdown(gscSiteUrl) : Promise.resolve<{ status: "no_data" }>({ status: "no_data" }),
  ]);

  const promptParts: string[] = [`${row.clientName}'s current SEO snapshot: ${summarizeRow(row)}.`];

  if (sitemapResult.status === "ok") {
    promptParts.push(
      `Sitemap has ${sitemapResult.urls.length} URLs. A sample: ${sitemapResult.urls.slice(0, 40).join(", ")}.`,
    );
  } else {
    promptParts.push("No sitemap could be found for this domain.");
  }

  if (gscBreakdown.status === "ok") {
    if (gscBreakdown.topQueries.length > 0) {
      const top = gscBreakdown.topQueries
        .slice(0, 20)
        .map((q) => `"${q.key}" (${q.clicks} clicks, position ${q.position.toFixed(1)})`)
        .join("; ");
      promptParts.push(`Top queries over the last ~28 days: ${top}.`);
    }
    if (gscBreakdown.topPages.length > 0) {
      const top = gscBreakdown.topPages
        .slice(0, 20)
        .map((p) => `${p.key} (${p.clicks} clicks, position ${p.position.toFixed(1)})`)
        .join("; ");
      promptParts.push(`Top pages over the last ~28 days: ${top}.`);
    }
  } else {
    promptParts.push("No deeper Search Console query/page breakdown is available yet.");
  }

  if (notesHistory.length > 0) {
    promptParts.push(
      `History of what the team has already noted, oldest to newest: ${notesHistory.map((n) => `[${n.month}] ${n.notes}`).join(" | ")}.`,
    );
  }

  const { output } = await generateText({
    model: NARRATIVE_MODEL,
    instructions:
      "You are an SEO strategist writing a to-do list for an agency managing this client. Use the sitemap, the " +
      "top queries/pages, the current tier/trend numbers, and the team's own notes history together — a good " +
      "recommendation references an actual page from the sitemap or a real query from the data, not a generic " +
      "'improve your content' tip. Never invent a page, query, or competitor that wasn't given to you. If the " +
      "team's notes already mention doing something, don't recommend it again unless the data shows it didn't work.",
    prompt: promptParts.join("\n"),
    output: Output.object({ schema: recommendationsOutputSchema }),
  });

  return {
    recommendations: output.recommendations,
    sitemapUrlCount: sitemapResult.status === "ok" ? sitemapResult.urls.length : null,
  };
}
