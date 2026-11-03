import { LEAD_TONES, type LeadTone } from "./types";

// The wording the team picks before a report goes to a client. The tone
// changes how the summary and the openers are written, never the numbers.
export const TONE_INFO: Record<LeadTone, { label: string; hint: string; instruction: string }> = {
  positive: {
    label: "Positive",
    hint: "Upbeat, opportunity-first. No negative words.",
    instruction:
      "Write in a warm, upbeat, encouraging voice. Frame everything as an opportunity or a next step. Never use negative words such as bad, poor, weak, failed, problem, issue, decline, drop, lost, missed opportunity, worst or disappointing — say 'room to grow', 'worth a call back', 'next step' instead.",
  },
  neutral: {
    label: "Neutral",
    hint: "Plain and factual.",
    instruction: "Write in a plain, factual, even-handed voice. State what the leads show without hype or alarm.",
  },
  direct: {
    label: "Direct",
    hint: "Short, action-first, no filler.",
    instruction: "Write short, direct sentences that lead with the action. No filler, no pleasantries.",
  },
  urgent: {
    label: "Urgent",
    hint: "Stresses calling fast, still professional.",
    instruction:
      "Stress speed: these leads cool quickly, so push the team to call today. Keep it professional and never alarming or negative about the client.",
  },
};

export function isLeadTone(value: unknown): value is LeadTone {
  return typeof value === "string" && (LEAD_TONES as readonly string[]).includes(value);
}

export function toneInstruction(tone: LeadTone, note: string | null): string {
  const extra = note?.trim() ? ` Also follow this wording guidance from the team exactly: "${note.trim().slice(0, 400)}".` : "";
  return `${TONE_INFO[tone].instruction}${extra}`;
}
