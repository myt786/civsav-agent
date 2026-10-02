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
    ifEmpty: "We can't see this client's Google Ads account yet. In their Google Ads, open Admin → Access and security → Managers and accept or add a link to our manager account (ID shown on the row).",
  },
  meta: {
    what: "Connects to this client's Facebook/Instagram ad account, which is where spend and lead results for their Meta campaigns come from.",
    ifWrong: "You'd be looking at a different client's ad spend, or a paused/removed account that never returns data.",
    ifEmpty: "We can't see this client's Meta ad account yet. In Meta Business Manager, give our agency access to their ad account.",
  },
  ga4: {
    what: "Connects to this client's website in Google Analytics, which is where website visits and enquiries come from.",
    ifWrong: "You'd be looking at visits for the wrong website.",
    ifEmpty: "We can't see this website in Google Analytics yet. In Google Analytics, open Admin → Property access management and add our Google reporting account (shown on the row) as a Viewer.",
  },
  search_console: {
    what: "Connects to this client's website in Google Search Console, which is where their Google search clicks and rankings come from.",
    ifWrong: "You'd be looking at search performance for a different website entirely.",
    ifEmpty: "We can't see this website in Search Console yet. In Search Console, open Settings → Users and permissions and add our Google reporting account (shown on the row) as a Restricted user.",
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

// Where to go on each platform to give us access — linked from the
// account rows in Settings, so fixing "we can't see this account" is one
// click instead of hunting through the platform's menus. Uses the saved
// account when there is one, to land on that exact account's page.
export interface PlatformAccessLink {
  label: string;
  href: (externalId: string | null) => string;
}

export const PLATFORM_ACCESS_LINKS: Partial<Record<Platform, PlatformAccessLink>> = {
  ghl: {
    label: "Open GoHighLevel private integrations",
    href: (locationId) =>
      locationId
        ? `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}/settings/private-integrations`
        : "https://app.gohighlevel.com/",
  },
  google_ads: {
    label: "Open Google Ads account access",
    href: () => "https://ads.google.com/aw/accountaccess",
  },
  meta: {
    label: "Open Meta Business ad account settings",
    href: () => "https://business.facebook.com/settings/ad-accounts",
  },
  ga4: {
    label: "Open Google Analytics admin",
    href: () => "https://analytics.google.com/analytics/web/#/admin",
  },
  search_console: {
    label: "Open Search Console users",
    href: (siteUrl) =>
      siteUrl
        ? `https://search.google.com/search-console/users?resource_id=${encodeURIComponent(siteUrl)}`
        : "https://search.google.com/search-console/users",
  },
  ahrefs: {
    label: "Open Ahrefs projects",
    href: () => "https://app.ahrefs.com/dashboard",
  },
  openphone: {
    label: "Open OpenPhone API settings",
    href: () => "https://my.openphone.com/settings/api",
  },
};
