// AI lead report (lib/lead-report): every lead a client got in a period —
// website forms (Lead Dashboard), GoHighLevel contacts and phone callers
// (OpenPhone) — de-duplicated, scored and ranked into a call list. The
// numbers and tiers are computed in code; the AI reads each lead's own
// words to judge timing, size and intent, and writes the context line and
// the opener. The team reviews it before it goes to the client as a PDF.

export type LeadChannel = "website" | "crm" | "phone";
export type LeadCadence = "off" | "weekly" | "monthly";
export type LeadReportKind = "weekly" | "monthly" | "on_demand";
export type LeadReportStatus = "in_review" | "changes_requested" | "approved" | "sent";
export type LeadTier = 1 | 2 | 3;

export const LEAD_TONES = ["positive", "neutral", "direct", "urgent"] as const;
export type LeadTone = (typeof LEAD_TONES)[number];

// What the AI reads from a lead's own words. "unknown" when they didn't say.
export type LeadTiming = "immediate" | "week" | "weeks" | "months" | "later" | "unknown";
export type LeadSize = "business" | "large" | "medium" | "small" | "unknown";
export type LeadIntent = "quote" | "specific" | "general" | "none";

// One contact from one channel, before merging.
export interface LeadTouch {
  channel: LeadChannel;
  // The platform's own id, so re-synced days don't count twice.
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  // Where it came from inside the channel: form name, page, CRM source.
  source: string | null;
  // Their own words and form answers, flattened to "key: value" text.
  details: string | null;
  createdAt: string; // ISO
  // CRM tags and stage status; phone call counts.
  tags: string[];
  booked: boolean;
  value: number | null;
  // Abandoned (half-filled) form.
  partial: boolean;
  calls?: { total: number; missed: number; seconds: number };
}

// One person after merging every channel they used.
export interface MergedLead {
  key: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  channels: LeadChannel[];
  sources: string[];
  details: string;
  firstAt: string;
  lastAt: string;
  submissions: number;
  calls: number;
  missedCalls: number;
  booked: boolean;
  value: number | null;
  partialOnly: boolean;
  tags: string[];
}

export interface LeadAssessment {
  timing: LeadTiming;
  size: LeadSize;
  intent: LeadIntent;
  junk: boolean;
  context: string;
  opener: string;
}

export interface ScoredLead extends MergedLead {
  rank: number;
  score: number;
  tier: LeadTier | "booked";
  assessment: LeadAssessment;
}

export interface LeadReportSummary {
  headline: string;
  intro: string;
  // One short paragraph per tier on who is in it and how to work it.
  tierNotes: { tier1: string; tier2: string; tier3: string; booked: string };
  takeaways: string[];
}

export interface LeadReport {
  version: 1;
  clientName: string;
  period: { start: string; end: string; label: string };
  tone: LeadTone;
  toneNote: string | null;
  counts: {
    total: number;
    open: number;
    tier1: number;
    tier2: number;
    tier3: number;
    booked: number;
    junk: number;
    duplicatesMerged: number;
  };
  byChannel: { label: string; count: number }[];
  leads: ScoredLead[];
  summary: LeadReportSummary;
  // Channels with no lead-level data (not connected, or nothing stored).
  missingChannels: string[];
  model: string;
}

export interface LeadReportEvent {
  id: string;
  kind: "generated" | "remark" | "approved" | "changes_requested" | "edited" | "sent";
  by: string;
  at: string;
  text: string | null;
}

export interface LeadReportRow {
  id: string;
  clientId: string;
  clientName: string;
  kind: LeadReportKind;
  periodStart: string;
  periodEnd: string;
  status: LeadReportStatus;
  tone: LeadTone;
  report: LeadReport;
  events: LeadReportEvent[];
  createdBy: string;
  generatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  sentTo: string[];
}

export interface LeadReportListEntry {
  id: string;
  clientId: string;
  clientName: string;
  kind: LeadReportKind;
  periodStart: string;
  periodEnd: string;
  status: LeadReportStatus;
  tone: LeadTone;
  generatedAt: string;
  counts: LeadReport["counts"];
  remarks: number;
  approvedBy: string | null;
  sentAt: string | null;
}
