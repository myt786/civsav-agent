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
    what: "Connects to this client's sub-account in GoHighLevel, which is where their leads and sales pipeline come from. Each client needs their own GoHighLevel key.",
    ifWrong: "The dashboard would show another client's leads, or show an error instead of numbers.",
    ifEmpty:
      "Add this client's GoHighLevel key first, using the \"Add this client's GoHighLevel key\" link below. After that they show up in this list by name.",
  },
  google_ads: {
    what: "Connects to this client's Google Ads account, which is where spend, clicks, and results for their ad campaigns come from.",
    ifWrong: "You'd be looking at a different client's ad spend and results without realizing it.",
    ifEmpty: "We can't see this client's Google Ads account yet. It needs to be linked to our main Google Ads manager account first.",
  },
  meta: {
    what: "Connects to this client's Facebook/Instagram ad account, which is where spend and lead results for their Meta campaigns come from.",
    ifWrong: "You'd be looking at a different client's ad spend, or a paused/removed account that never returns data.",
    ifEmpty: "We can't see this client's Meta ad account yet. In Meta Business Manager, give our agency access to their ad account.",
  },
  ga4: {
    what: "Connects to this client's website in Google Analytics, which is where website visits and enquiries come from.",
    ifWrong: "You'd be looking at visits for the wrong website.",
    ifEmpty: "We can't see this website in Google Analytics yet. Add our Google reporting account as a Viewer on it (ask your developer for the email address).",
  },
  search_console: {
    what: "Connects to this client's website in Google Search Console, which is where their Google search clicks and rankings come from.",
    ifWrong: "You'd be looking at search performance for a different website entirely.",
    ifEmpty: "We can't see this website in Search Console yet. Add our Google reporting account as a user on it (ask your developer for the email address).",
  },
  ahrefs: {
    what: "Connects to this client's website in Ahrefs, which is where SEO numbers like keywords and backlinks come from.",
    ifWrong: "You'd be looking at SEO data for the wrong website.",
    ifEmpty: "This website hasn't been added to Ahrefs yet. Add it as a project in Ahrefs first.",
  },
  openphone: {
    what: "Connects to this client's phone number in OpenPhone, which is where their call counts come from.",
    ifWrong: "You'd be looking at call activity for a different client's phone number.",
    ifEmpty:
      "We can't see this number yet. If it's in a different OpenPhone workspace, add that workspace's key using the link below — all its numbers will then show up here.",
  },
};
