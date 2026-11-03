import { leadDashboardDataSchema } from "../connectors/lead-dashboard/schema";
import { ghlDataSchema } from "../connectors/ghl/schema";
import { telephonyDataSchema } from "../connectors/openphone/schema";
import { metaDataSchema } from "../connectors/meta/schema";
import { googleAdsDataSchema } from "../connectors/google-ads/schema";
import type { Platform } from "../connectors/types";

// Total leads = every lead source a client has connected, added together.
// Each one can be switched off per client (clients.lead_sources_off) when
// it double-counts another — e.g. Google Ads conversions that track the
// same form fills the Lead Dashboard already counts. Used by the dashboard,
// Insights, the daily summary and the AI analysis, so they all agree.

export type LeadSource = "lead_dashboard" | "ghl" | "calls" | "meta" | "google_ads";

export interface LeadSourceInfo {
  key: LeadSource;
  platform: Platform;
  label: string;
  short: string;
  // What one lead is, for the settings card and Help page.
  counts: string;
}

export const LEAD_SOURCES: LeadSourceInfo[] = [
  { key: "lead_dashboard", platform: "lead_dashboard", label: "Website forms", short: "Forms", counts: "Lead Dashboard form leads, spam left out" },
  { key: "ghl", platform: "ghl", label: "GoHighLevel", short: "GHL", counts: "New GoHighLevel opportunities" },
  { key: "calls", platform: "openphone", label: "Answered calls", short: "Calls", counts: "OpenPhone calls that were answered" },
  { key: "meta", platform: "meta", label: "Meta Ads leads", short: "Meta", counts: "Meta Ads results (lead forms and other lead actions)" },
  { key: "google_ads", platform: "google_ads", label: "Google Ads conversions", short: "G Ads", counts: "Google Ads conversions" },
];

export const LEAD_SOURCE_KEYS = LEAD_SOURCES.map((s) => s.key);

export function isLeadSource(value: unknown): value is LeadSource {
  return typeof value === "string" && (LEAD_SOURCE_KEYS as string[]).includes(value);
}

export function leadSourceInfo(source: LeadSource): LeadSourceInfo {
  return LEAD_SOURCES.find((s) => s.key === source)!;
}

// The sources that count for a client: connected, and not switched off.
export function countedLeadSources(connected: (platform: Platform) => boolean, off: readonly string[] | null | undefined): LeadSource[] {
  const switchedOff = new Set(off ?? []);
  return LEAD_SOURCES.filter((s) => connected(s.platform) && !switchedOff.has(s.key)).map((s) => s.key);
}

// One day's leads from one source's stored snapshot; null if the snapshot
// doesn't parse (never a made-up zero).
export function leadsFromSnapshot(source: LeadSource, metrics: unknown): number | null {
  switch (source) {
    case "lead_dashboard": {
      const p = leadDashboardDataSchema.safeParse(metrics);
      return p.success ? Math.max(0, p.data.totalLeads - p.data.spamLeads) : null;
    }
    case "ghl": {
      const p = ghlDataSchema.safeParse(metrics);
      return p.success ? p.data.leadCount : null;
    }
    case "calls": {
      const p = telephonyDataSchema.safeParse(metrics);
      return p.success ? Math.max(0, p.data.totalCalls - (p.data.missedCalls - p.data.missedAndForwardedCalls)) : null;
    }
    case "meta": {
      const p = metaDataSchema.safeParse(metrics);
      return p.success ? p.data.results : null;
    }
    case "google_ads": {
      const p = googleAdsDataSchema.safeParse(metrics);
      return p.success ? p.data.conversions : null;
    }
  }
}
