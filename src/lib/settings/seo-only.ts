import type { Platform } from "../connectors/types";

// Search Console and Ahrefs are the SEO page's sources; everything else
// (leads, calls, ads, GA4) feeds the health dashboard.
const SEO_PLATFORMS: Platform[] = ["search_console", "ahrefs"];

// A client whose only connected accounts are SEO ones — typically added
// from the SEO sheet. A client with no accounts at all isn't counted: it's
// more likely still being set up. Any non-SEO account, even one switched
// off, means the client is a health dashboard client too.
export function isSeoOnly(accounts: { platform: Platform }[]): boolean {
  return accounts.length > 0 && accounts.every((a) => SEO_PLATFORMS.includes(a.platform));
}
