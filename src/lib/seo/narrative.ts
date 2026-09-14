import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { formatInteger, formatPercent, formatPosition } from "../dashboard/format";
import type { SeoClientRow } from "./types";

const NARRATIVE_MODEL = "google/gemini-2.5-flash-lite";

const suggestionsOutputSchema = z.object({
  suggestions: z
    .array(z.string().describe("One actionable suggestion, 1-2 sentences, plain English, something a person can do this week."))
    .min(3)
    .max(5),
});

export interface SeoSuggestions {
  suggestions: string[];
}

// Renders the same numbers already visible on /seo into short lines the
// model reasons over — same discipline as insights/narrative.ts: it never
// sees raw DB rows and can't introduce a figure that isn't already
// computed and displayed elsewhere in the app.
function summarizeRowForPrompt(row: SeoClientRow): string {
  const parts: string[] = [];
  const newest = row.months[row.months.length - 1];
  if (newest?.clicks.kind === "ok" || newest?.clicks.kind === "unverified") {
    parts.push(`clicks this month: ${formatInteger(newest.clicks.value)}`);
  }
  if (newest?.impressions.kind === "ok" || newest?.impressions.kind === "unverified") {
    parts.push(`impressions this month: ${formatInteger(newest.impressions.value)}`);
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
  if (row.notes) parts.push(`this month's notes from the team: ${row.notes}`);
  if (parts.length <= 1) parts.push("no connector data has synced for this client yet");
  return parts.join(", ");
}

// A single structured call, grounded entirely in one client's already-
// computed /seo row — the model is asked to phrase and suggest from what's
// already true, never to compute or guess a metric itself.
export async function generateSeoSuggestions(row: SeoClientRow): Promise<SeoSuggestions> {
  const { output } = await generateText({
    model: NARRATIVE_MODEL,
    instructions:
      "You write short, actionable SEO suggestions for an agency managing this client's Search Console + Ahrefs " +
      "data. Only reason from the numbers given — never invent a metric, a specific page URL, or a competitor. " +
      "If the data shows growth, suggest how to build on it; if it shows decline, low volume, or no data at all, " +
      "suggest what to check first. Each suggestion should be something a person can actually act on this week.",
    prompt: `${row.clientName}'s SEO data this month: ${summarizeRowForPrompt(row)}.`,
    output: Output.object({ schema: suggestionsOutputSchema }),
  });

  return output;
}
