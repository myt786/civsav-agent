import type {
  LeadAssessment,
  LeadChannel,
  LeadIntent,
  LeadSize,
  LeadTier,
  LeadTiming,
  LeadTouch,
  MergedLead,
  ScoredLead,
} from "./types";

// De-duplication and scoring — all in code, so the same leads always get
// the same score and the tiers can be explained to the client.

// Last 10 digits, so "+1 (815) 452-4785" and "8154524785" match.
export function normalisePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

export function normaliseEmail(email: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

const CHANNEL_ORDER: LeadChannel[] = ["website", "crm", "phone"];

// Matches on phone first, then email (the sample report's rule); a lead
// whose phone matches one person and email another joins the first.
export function mergeTouches(touches: LeadTouch[]): MergedLead[] {
  const groups: LeadTouch[][] = [];
  const byPhone = new Map<string, number>();
  const byEmail = new Map<string, number>();

  for (const touch of touches) {
    const phone = normalisePhone(touch.phone);
    const email = normaliseEmail(touch.email);
    let index = phone !== null ? byPhone.get(phone) : undefined;
    if (index === undefined && email !== null) index = byEmail.get(email);
    if (index === undefined) {
      index = groups.length;
      groups.push([]);
    }
    groups[index].push(touch);
    if (phone !== null && !byPhone.has(phone)) byPhone.set(phone, index);
    if (email !== null && !byEmail.has(email)) byEmail.set(email, index);
  }

  return groups.map((group, i) => {
    // Website record wins for contact details, then CRM, then phone.
    const ordered = [...group].sort(
      (a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel) || a.createdAt.localeCompare(b.createdAt),
    );
    const first = <K extends keyof LeadTouch>(key: K) => ordered.map((t) => t[key]).find((v) => v !== null && v !== "") ?? null;
    const channels = CHANNEL_ORDER.filter((c) => group.some((t) => t.channel === c));
    const times = group.map((t) => t.createdAt).sort();
    const calls = group.reduce((sum, t) => sum + (t.calls?.total ?? 0), 0);
    const missedCalls = group.reduce((sum, t) => sum + (t.calls?.missed ?? 0), 0);
    const forms = group.filter((t) => t.channel !== "phone");
    const values = group.map((t) => t.value).filter((v): v is number => v !== null);
    const detailParts = [...new Set(ordered.map((t) => t.details).filter((d): d is string => !!d))];
    const phone = first("phone") as string | null;
    const email = first("email") as string | null;
    return {
      key: normalisePhone(phone) ?? normaliseEmail(email) ?? `lead-${i}`,
      name: first("name") as string | null,
      email,
      phone,
      company: first("company") as string | null,
      channels,
      sources: [...new Set(group.map((t) => t.source).filter((s): s is string => !!s))],
      details: detailParts.join(" | ").slice(0, 2000),
      firstAt: times[0],
      lastAt: times[times.length - 1],
      submissions: forms.length,
      calls,
      missedCalls,
      booked: group.some((t) => t.booked),
      value: values.length ? Math.max(...values) : null,
      partialOnly: forms.length > 0 && forms.every((t) => t.partial) && calls === 0,
      tags: [...new Set(group.flatMap((t) => t.tags))],
    };
  });
}

const TIMING_POINTS: Record<LeadTiming, number> = { immediate: 40, week: 38, weeks: 30, months: 18, later: 8, unknown: 12 };
const SIZE_POINTS: Record<LeadSize, number> = { business: 25, large: 22, medium: 15, small: 6, unknown: 8 };
const INTENT_POINTS: Record<LeadIntent, number> = { quote: 25, specific: 18, general: 6, none: 0 };

export const TIER_1_MIN = 55;
export const TIER_2_MIN = 40;

// 0–100: timing (≤40) + size (≤25) + how specific the ask was (≤25) +
// persistence (+10 per extra submission, +14 per extra call, ≤28) +
// recency (≤15, one point less per 10 days) + 8 when they used two
// channels. The same method the sample report describes.
export function scoreLead(lead: MergedLead, assessment: LeadAssessment, periodEnd: Date): number {
  const extraSubmissions = Math.max(0, lead.submissions - 1);
  const extraCalls = Math.max(0, lead.calls - 1);
  const persistence = Math.min(28, extraSubmissions * 10 + extraCalls * 14);
  const ageDays = Math.max(0, (periodEnd.getTime() - Date.parse(lead.lastAt)) / 86_400_000);
  const recency = Math.max(0, 15 - Math.floor(ageDays / 10));
  const multiChannel = lead.channels.length > 1 ? 8 : 0;
  const partialPenalty = lead.partialOnly ? 10 : 0;
  const raw =
    TIMING_POINTS[assessment.timing] +
    SIZE_POINTS[assessment.size] +
    INTENT_POINTS[assessment.intent] +
    persistence +
    recency +
    multiChannel -
    partialPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function tierFor(score: number): LeadTier {
  return score >= TIER_1_MIN ? 1 : score >= TIER_2_MIN ? 2 : 3;
}

// Booked leads are listed apart ("confirm, don't re-prospect"); junk is
// dropped. Open leads rank by score, then most recent.
export function rankLeads(
  leads: MergedLead[],
  assessments: Map<string, LeadAssessment>,
  periodEnd: Date,
): { ranked: ScoredLead[]; junk: number } {
  const scored: ScoredLead[] = [];
  let junk = 0;
  for (const lead of leads) {
    const assessment = assessments.get(lead.key) ?? fallbackAssessment(lead);
    if (assessment.junk) {
      junk += 1;
      continue;
    }
    const score = scoreLead(lead, assessment, periodEnd);
    scored.push({ ...lead, rank: 0, score, tier: lead.booked ? "booked" : tierFor(score), assessment });
  }
  const order = (l: ScoredLead) => (l.tier === "booked" ? 4 : l.tier);
  scored.sort((a, b) => order(a) - order(b) || b.score - a.score || b.lastAt.localeCompare(a.lastAt));
  scored.forEach((lead, i) => (lead.rank = i + 1));
  return { ranked: scored, junk };
}

// Used when the AI didn't return an answer for a lead (or wasn't asked,
// past the cap): judged from what's known without reading their words.
export function fallbackAssessment(lead: MergedLead): LeadAssessment {
  const intent: LeadIntent = /quote|price|pricing|estimate|order|buy|purchase/i.test(lead.details)
    ? "quote"
    : lead.details.length > 40
      ? "general"
      : "none";
  const what =
    lead.calls > 0 && lead.submissions === 0
      ? `Called ${lead.calls} time${lead.calls === 1 ? "" : "s"}${lead.missedCalls ? `, ${lead.missedCalls} missed` : ""}`
      : lead.details
        ? lead.details.slice(0, 140)
        : "Submitted a form";
  return {
    timing: "unknown",
    size: lead.company ? "business" : "unknown",
    intent,
    junk: false,
    context: what,
    opener: lead.missedCalls > 0 ? "Sorry we missed your call — how can we help?" : "Thanks for reaching out — what are you looking for?",
  };
}
