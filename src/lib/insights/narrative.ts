import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { formatCurrency, formatInteger, formatPercent, formatPosition } from "../dashboard/format";
import type { DashboardData } from "../dashboard/types";
import type { AttentionFlag } from "./types";
import { groupDataIssues, isDataFlag, type DataIssue } from "./data-issues";

const NARRATIVE_MODEL = "google/gemini-2.5-flash-lite";

const narrativeOutputSchema = z.object({
  fleetSummary: z
    .string()
    .describe(
      "At most 2 short sentences on how the whole roster is doing. Name at most 3 clients. Mention data problems only as a count, never client by client.",
    ),
  clientNotes: z
    .array(
      z.object({
        clientId: z.string(),
        tone: z.enum(["concern", "good"]).describe("concern = needs a look; good = going well."),
        note: z
          .string()
          .describe("Under 15 words, plain English, specific. Don't repeat the client's name."),
      }),
    )
    .describe(
      "Only clients with a notable change worth acting on or celebrating — at most 8. Skip clients whose only issue is a data problem, and skip clients where nothing notable happened.",
    ),
});

export interface FleetNarrative {
  fleetSummary: string;
  clientNotes: { clientId: string; clientName: string; tone: "concern" | "good"; note: string }[];
  // Grouped in code, not by the model: one line per cause instead of one
  // per client.
  dataIssues: DataIssue[];
}

// Renders the same numbers already on the table into short lines the model
// reasons over — it never sees raw DB rows and can't introduce a figure
// that isn't already computed and displayed elsewhere in the app.
function summarizeRowForPrompt(data: DashboardData, clientId: string): string {
  const row = data.rows.find((r) => r.clientId === clientId);
  if (!row) return "";
  const parts: string[] = [];
  if (row.leads.kind === "ok" || row.leads.kind === "unverified") parts.push(`leads: ${formatInteger(row.leads.value)}`);
  if (row.leadsDelta.pct !== null) parts.push(`leads vs prior week: ${formatPercent(row.leadsDelta.pct)}`);
  if (row.spend.kind === "ok" || row.spend.kind === "unverified") parts.push(`spend: ${formatCurrency(row.spend.value)}`);
  if (row.cpl.kind === "ok" || row.cpl.kind === "unverified") parts.push(`CPL: ${formatCurrency(row.cpl.value)}`);
  if (row.calls.kind === "ok" || row.calls.kind === "unverified")
    parts.push(`calls: ${row.calls.value.total} (${row.calls.value.missed} missed)`);
  if (row.avgPosition.kind === "ok" || row.avgPosition.kind === "unverified")
    parts.push(`avg. search position: ${formatPosition(row.avgPosition.value)}`);
  return parts.join(", ");
}

// A single structured call, grounded entirely in numbers the dashboard
// already computed (row cells + rule-based flags) — the model is asked to
// phrase what's already true, never to compute or guess a metric itself.
export async function generateFleetNarrative(data: DashboardData, flags: AttentionFlag[]): Promise<FleetNarrative> {
  const dataIssues = groupDataIssues(flags);
  const flagsByClient = new Map<string, AttentionFlag[]>();
  for (const flag of flags) {
    if (isDataFlag(flag)) continue;
    const list = flagsByClient.get(flag.clientId) ?? [];
    list.push(flag);
    flagsByClient.set(flag.clientId, list);
  }

  const clientLines = data.rows.map((row) => {
    const clientFlags = flagsByClient.get(row.clientId) ?? [];
    const flagText = clientFlags.length ? ` FLAGS: ${clientFlags.map((f) => f.message).join("; ")}.` : "";
    return `- ${row.clientName} (id: ${row.clientId}): ${summarizeRowForPrompt(data, row.clientId)}.${flagText}`;
  });

  const { output } = await generateText({
    model: NARRATIVE_MODEL,
    instructions:
      "You write terse, plain-English status notes for an agency's weekly client dashboard. " +
      "Only describe numbers and flags given to you — never invent a figure, and never soften or hide a flagged problem. " +
      "Prioritize clients with flags in the fleet summary. If nothing is flagged, say so plainly rather than inventing concern. " +
      "Be brief: the reader skims this on a phone.",
    prompt:
      `This week's client data:\n${clientLines.join("\n")}` +
      (dataIssues.length > 0
        ? `\n\nData problems (listed separately for the reader — don't write client notes for these): ${dataIssues
            .map((issue) => `${issue.what} not updating for ${issue.clients.length} client(s)`)
            .join("; ")}.`
        : ""),
    output: Output.object({ schema: narrativeOutputSchema }),
  });

  const nameById = new Map(data.rows.map((r) => [r.clientId, r.clientName]));
  return {
    fleetSummary: output.fleetSummary,
    clientNotes: output.clientNotes
      .filter((n) => nameById.has(n.clientId))
      .map((n) => ({ ...n, clientName: nameById.get(n.clientId)! })),
    dataIssues,
  };
}
