import type { Platform } from "./types";

// Shared platform metadata — display order and human labels — used by both
// the dashboard (sync status strip) and the settings UI (mapping rows), so
// the two stay in sync rather than drifting into separate label sets.
export const PLATFORM_ORDER: Platform[] = [
  "lead_dashboard",
  "ghl",
  "google_ads",
  "meta",
  "ga4",
  "search_console",
  "ahrefs",
  "openphone",
];

export const PLATFORM_LABELS: Record<Platform, string> = {
  lead_dashboard: "Lead Dashboard",
  ghl: "GoHighLevel",
  google_ads: "Google Ads",
  meta: "Meta Ads",
  ga4: "GA4",
  search_console: "Search Console",
  ahrefs: "Ahrefs",
  openphone: "OpenPhone",
};

// Plain-English help for the settings UI's per-row "?" popover — written
// for a non-technical account manager, not as API documentation.
export interface PlatformHelp {
  what: string;
  ifWrong: string;
  ifEmpty: string;
}

export const PLATFORM_HELP: Record<Platform, PlatformHelp> = {
  lead_dashboard: {
    what: "Connects this client to their record in our own lead-tracking system, which is where their lead counts and lead quality come from on the dashboard.",
    ifWrong: "You'd see another client's leads mixed into this one's numbers, or none at all.",
    ifEmpty: "This client hasn't been set up in the lead dashboard yet — ask whoever manages onboarding there to create it first.",
  },
  ghl: {
    what: "Connects to this client's sub-account in GoHighLevel, which is where their opportunities and pipeline activity come from.",
    ifWrong: "The dashboard would show another client's opportunities, or a location that doesn't exist would just fail every sync.",
    ifEmpty: "We don't see any GoHighLevel sub-accounts yet — check that this client has been added under our agency account in GHL.",
  },
  google_ads: {
    what: "Connects to this client's Google Ads account, which is where spend, clicks, and results for their ad campaigns come from.",
    ifWrong: "You'd be looking at a different client's ad spend and results without realizing it.",
    ifEmpty: "We don't see any Google Ads accounts yet — this client's account needs to be linked under our manager (MCC) account before it will show up here.",
  },
  meta: {
    what: "Connects to this client's Facebook/Instagram ad account, which is where spend and lead results for their Meta campaigns come from.",
    ifWrong: "You'd be looking at a different client's ad spend, or a paused/removed account that never returns data.",
    ifEmpty: "No access to Meta accounts. Check that our system user has been assigned to this client's ad account in Business Manager.",
  },
  ga4: {
    what: "Connects to this client's website analytics property in Google Analytics, which is where sessions and on-site conversions come from.",
    ifWrong: "You'd be looking at traffic for the wrong website, or a property we don't actually have access to.",
    ifEmpty: "We don't see any GA4 properties yet — the service account needs to be added as a viewer on this client's property in Google Analytics.",
  },
  search_console: {
    what: "Connects to this client's verified website in Google Search Console, which is where organic search rankings and clicks come from.",
    ifWrong: "You'd be looking at search performance for a different website entirely.",
    ifEmpty: "We don't see any verified sites yet — the service account needs to be added as a user on this client's property in Search Console.",
  },
  ahrefs: {
    what: "Connects to this client's tracked domain in Ahrefs, which is where SEO metrics like rankings and backlinks come from.",
    ifWrong: "You'd be looking at SEO data for the wrong website.",
    ifEmpty: "This client's domain hasn't been added as a project in Ahrefs yet — it needs to be set up there before it will show up here.",
  },
  openphone: {
    what: "Connects to this client's tracked phone number in OpenPhone, which is where call volume and call outcomes come from.",
    ifWrong: "You'd be looking at call activity for a different client's phone number.",
    ifEmpty: "We don't see any phone numbers yet — check that this client's number has been added to our OpenPhone workspace.",
  },
};
