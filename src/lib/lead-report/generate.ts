import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { addDays, subDays } from "date-fns";
import { z } from "zod";
import { getDb } from "../db";
import { clientPlatformAccounts, clients, leadReports, rawResponses } from "../db/schema";
import { openAiJson } from "../ai/openai";
import { touchesFromPayloads } from "./extract";
import { mergeTouches, rankLeads } from "./score";
import { leadPeriodFor, type LeadPeriod } from "./period";
import { isLeadTone, toneInstruction } from "./tone";
import type {
  LeadAssessment,
  LeadChannel,
  LeadReport,
  LeadReportEvent,
  LeadReportKind,
  LeadReportSummary,
  LeadTone,
  MergedLead,
  ScoredLead,
} from "./types";

const LEAD_PLATFORMS = ["lead_dashboard", "ghl", "openphone"] as const;
const CHANNEL_LABEL: Record<LeadChannel, string> = { website: "Website form", crm: "GoHighLevel", phone: "Phone" };
const PLATFORM_LABEL: Record<(typeof LEAD_PLATFORMS)[number], string> = {
  lead_dashboard: "Website forms (Lead Dashboard)",
  ghl: "GoHighLevel",
  openphone: "Phone calls (OpenPhone)",
};

// Leads the AI reads one by one; past this, the oldest are scored from
// what's known without reading their words.
const AI_LEAD_CAP = 300;
const BATCH_SIZE = 25;
const CONCURRENCY = 3;

export function newEventId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function collect(clientId: string, timezone: string, period: LeadPeriod) {
  const db = await getDb();
  const accounts = await db
    .select({ platform: clientPlatformAccounts.platform })
    .from(clientPlatformAccounts)
    .where(and(eq(clientPlatformAccounts.clientId, clientId), eq(clientPlatformAccounts.active, true)));
  const connected = LEAD_PLATFORMS.filter((p) => accounts.some((a) => a.platform === p));

  const from = fromZonedTime(`${period.start}T00:00:00`, timezone);
  const until = addDays(fromZonedTime(`${period.end}T00:00:00`, timezone), 1);
  // Each day is synced the morning after (some a few days later), so read
  // a little past the end; each lead's own date decides if it's in.
  const rows =
    connected.length === 0
      ? []
      : await db
          .select({ platform: rawResponses.platform, payload: rawResponses.payload, fetchedAt: rawResponses.fetchedAt })
          .from(rawResponses)
          .where(
            and(
              eq(rawResponses.clientId, clientId),
              inArray(rawResponses.platform, [...connected]),
              gte(rawResponses.fetchedAt, subDays(from, 1)),
              lte(rawResponses.fetchedAt, addDays(until, 4)),
            ),
          );

  const touches = touchesFromPayloads(rows).filter((t) => {
    const at = Date.parse(t.createdAt);
    return at >= from.getTime() && at < until.getTime();
  });
  const withData = new Set(touches.map((t) => (t.channel === "website" ? "lead_dashboard" : t.channel === "crm" ? "ghl" : "openphone")));
  const missing = LEAD_PLATFORMS.filter((p) => !withData.has(p)).map((p) =>
    connected.includes(p) ? `${PLATFORM_LABEL[p]} — connected, no leads stored for this period` : `${PLATFORM_LABEL[p]} — not connected`,
  );
  return { touches, missing, until };
}

const assessmentSchema = z.object({
  leads: z.array(
    z.object({
      key: z.string(),
      timing: z.enum(["immediate", "week", "weeks", "months", "later", "unknown"]),
      size: z.enum(["business", "large", "medium", "small", "unknown"]),
      intent: z.enum(["quote", "specific", "general", "none"]),
      junk: z.boolean(),
      context: z.string(),
      opener: z.string(),
    }),
  ),
});

function day(iso: string): string {
  return iso.slice(0, 10);
}

function leadLine(lead: MergedLead) {
  return {
    key: lead.key,
    name: lead.name,
    company: lead.company,
    channels: lead.channels.map((c) => CHANNEL_LABEL[c]),
    sources: lead.sources.slice(0, 4),
    first: day(lead.firstAt),
    last: day(lead.lastAt),
    formSubmissions: lead.submissions,
    calls: lead.calls,
    missedCalls: lead.missedCalls,
    halfFilledFormOnly: lead.partialOnly,
    alreadyBooked: lead.booked,
    tags: lead.tags.slice(0, 8),
    theirWords: lead.details.slice(0, 700) || null,
  };
}

async function assessBatch(clientName: string, leads: MergedLead[], tone: string): Promise<Map<string, LeadAssessment>> {
  const { output } = await openAiJson({
    instructions: [
      `You help ${clientName}'s sales team decide who to call first. For each lead, read what they wrote or did and judge:`,
      "- timing: when they said they'll buy — immediate (now/asap), week (within 7 days), weeks (2–4 weeks), months (1–3 months), later (3+ months), unknown (not said).",
      "- size: business (a dealer, reseller, contractor or company buying for others), large, medium, small (judge from acres, units, quantities, budget or employees they mention), unknown.",
      "- intent: quote (asked for a price/quote or built an order), specific (named a product, service or quantity), general (general enquiry), none (nothing said).",
      "- junk: true only for spam, vendor/SEO solicitations, job seekers, tests and pranks.",
      "- context: one short line (max 140 characters) on who they are and what they want, from their own words. Never invent facts. For phone-only leads, describe the calls.",
      "- opener: one sentence the salesperson can open the call with — lead with their product, need or situation, never 'just following up'. Max 160 characters.",
      `Wording for context and opener: ${tone}`,
      "Return one entry per lead, with the same key.",
    ].join("\n"),
    prompt: JSON.stringify({ leads: leads.map(leadLine) }),
    schema: assessmentSchema,
    temperature: 0.3,
  });
  const map = new Map<string, LeadAssessment>();
  for (const entry of output.leads) {
    map.set(entry.key, {
      timing: entry.timing,
      size: entry.size,
      intent: entry.intent,
      junk: entry.junk,
      context: entry.context.slice(0, 200),
      opener: entry.opener.slice(0, 220),
    });
  }
  return map;
}

async function assessAll(clientName: string, leads: MergedLead[], tone: string): Promise<Map<string, LeadAssessment>> {
  const newestFirst = [...leads].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, AI_LEAD_CAP);
  const batches: MergedLead[][] = [];
  for (let i = 0; i < newestFirst.length; i += BATCH_SIZE) batches.push(newestFirst.slice(i, i + BATCH_SIZE));
  const result = new Map<string, LeadAssessment>();
  const errors: unknown[] = [];
  async function worker() {
    while (batches.length > 0) {
      const batch = batches.shift();
      if (!batch) break;
      try {
        for (const [key, value] of await assessBatch(clientName, batch, tone)) result.set(key, value);
      } catch (error) {
        errors.push(error);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  // Every batch failing means the AI isn't reachable — say so instead of
  // sending a report scored without it.
  if (newestFirst.length > 0 && result.size === 0 && errors.length > 0) {
    const first = errors[0];
    throw first instanceof Error ? first : new Error("The AI couldn't assess these leads.");
  }
  return result;
}

const summarySchema = z.object({
  headline: z.string(),
  intro: z.string(),
  tierNotes: z.object({ tier1: z.string(), tier2: z.string(), tier3: z.string(), booked: z.string() }),
  takeaways: z.array(z.string()),
});

async function writeSummary(
  clientName: string,
  period: LeadPeriod,
  counts: LeadReport["counts"],
  byChannel: LeadReport["byChannel"],
  ranked: ScoredLead[],
  tone: string,
): Promise<{ summary: LeadReportSummary; model: string }> {
  const brief = (l: ScoredLead) => ({ name: l.name ?? l.phone, score: l.score, channels: l.channels, context: l.assessment.context });
  const { output, model } = await openAiJson({
    instructions: [
      `Write the summary of a sales call priority list for ${clientName}'s sales team, covering ${period.label}.`,
      "Leads are scored 0–100 on timing, size, how specific their ask was, persistence and recency; Tier 1 (55+) call today, Tier 2 (40–54) call this week, Tier 3 (under 40) nurture, and already-booked leads are listed to confirm, not re-prospect.",
      "headline: one line (max 90 characters). intro: 2–3 sentences on what this period's leads look like and where to start.",
      "tierNotes: one or two sentences per tier on who is in it (patterns you see) and how to work it. If a tier is empty, say so briefly.",
      "takeaways: 3–5 short, practical points for the sales team. Use only the numbers given — never invent figures.",
      `Address the client's team as "you". Wording: ${tone}`,
    ].join("\n"),
    prompt: JSON.stringify({
      period: period.label,
      counts,
      byChannel,
      tier1: ranked.filter((l) => l.tier === 1).slice(0, 15).map(brief),
      tier2: ranked.filter((l) => l.tier === 2).slice(0, 10).map(brief),
      tier3: ranked.filter((l) => l.tier === 3).slice(0, 8).map(brief),
      booked: ranked.filter((l) => l.tier === "booked").slice(0, 8).map(brief),
    }),
    schema: summarySchema,
    temperature: 0.4,
  });
  return { summary: { ...output, takeaways: output.takeaways.slice(0, 6) }, model };
}

export interface LeadReportOptions {
  kind: LeadReportKind;
  createdBy: string;
  now?: Date;
  days?: number;
  tone?: LeadTone;
  toneNote?: string | null;
  // Rewrite this report in place (new tone or fresh data), keeping its
  // remarks; it goes back to review.
  replaceId?: string;
  period?: LeadPeriod;
}

export async function buildLeadReport(
  client: { id: string; name: string; timezone: string },
  period: LeadPeriod,
  tone: LeadTone,
  toneNote: string | null,
): Promise<LeadReport> {
  const { touches, missing, until } = await collect(client.id, client.timezone, period);
  const merged = mergeTouches(touches);
  const toneText = toneInstruction(tone, toneNote);
  const assessments = await assessAll(client.name, merged, toneText);
  const { ranked, junk } = rankLeads(merged, assessments, until);

  const channelCounts = new Map<string, number>();
  for (const lead of ranked) {
    if (lead.tier === "booked") continue;
    const label = lead.channels.length > 1 ? "More than one channel" : CHANNEL_LABEL[lead.channels[0]];
    channelCounts.set(label, (channelCounts.get(label) ?? 0) + 1);
  }
  const counts: LeadReport["counts"] = {
    total: merged.length,
    open: ranked.filter((l) => l.tier !== "booked").length,
    tier1: ranked.filter((l) => l.tier === 1).length,
    tier2: ranked.filter((l) => l.tier === 2).length,
    tier3: ranked.filter((l) => l.tier === 3).length,
    booked: ranked.filter((l) => l.tier === "booked").length,
    junk,
    duplicatesMerged: touches.length - merged.length,
  };
  const byChannel = [...channelCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const { summary, model } =
    ranked.length === 0
      ? {
          summary: {
            headline: `No leads stored for ${period.label}`,
            intro: "There were no leads with contact details stored for this period.",
            tierNotes: { tier1: "", tier2: "", tier3: "", booked: "" },
            takeaways: [],
          },
          model: "none",
        }
      : await writeSummary(client.name, period, counts, byChannel, ranked, toneText);

  return {
    version: 1,
    clientName: client.name,
    period,
    tone,
    toneNote: toneNote?.trim() || null,
    counts,
    byChannel,
    leads: ranked,
    summary,
    missingChannels: missing,
    model,
  };
}

export async function generateLeadReport(clientId: string, options: LeadReportOptions): Promise<{ id: string; report: LeadReport }> {
  const db = await getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) throw new Error("That client wasn't found.");

  const existing = options.replaceId
    ? (await db.select().from(leadReports).where(eq(leadReports.id, options.replaceId)).limit(1))[0]
    : undefined;
  if (options.replaceId && (!existing || existing.clientId !== clientId)) throw new Error("That report wasn't found.");

  const tone: LeadTone = options.tone ?? (isLeadTone(client.leadReportTone) ? client.leadReportTone : "positive");
  const toneNote = options.toneNote !== undefined ? options.toneNote : client.leadReportToneNote;
  const period =
    options.period ??
    (existing
      ? { start: existing.periodStart, end: existing.periodEnd, label: (existing.report as LeadReport).period.label }
      : leadPeriodFor(options.kind, options.now ?? new Date(), client.timezone, options.days));

  const report = await buildLeadReport(client, period, tone, toneNote);
  const event: LeadReportEvent = {
    id: newEventId(),
    kind: "generated",
    by: options.createdBy,
    at: new Date().toISOString(),
    text: existing ? `Regenerated in a ${tone} tone` : null,
  };

  if (existing) {
    await db
      .update(leadReports)
      .set({
        report,
        tone,
        status: "in_review",
        approvedBy: null,
        approvedAt: null,
        generatedAt: new Date(),
        events: [...((existing.events as LeadReportEvent[]) ?? []), event],
      })
      .where(eq(leadReports.id, existing.id));
    return { id: existing.id, report };
  }

  const inserted = await db
    .insert(leadReports)
    .values({
      clientId,
      kind: options.kind,
      periodStart: period.start,
      periodEnd: period.end,
      status: "in_review",
      tone,
      report,
      events: [event],
      createdBy: options.createdBy,
    })
    .returning();
  return { id: inserted[0].id, report };
}
