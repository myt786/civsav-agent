import type { Connector, Platform } from "./types";
import { leadDashboardConnector } from "./lead-dashboard";
import { searchConsoleConnector } from "./search-console";
import { googleAdsConnector } from "./google-ads";
import { ga4Connector } from "./ga4";
import { ahrefsConnector } from "./ahrefs";
import { openPhoneConnector } from "./openphone";
import { ghlConnector } from "./ghl";
import { metaConnector } from "./meta";

// Platforms are added here as their connectors are built, without touching
// the contract.
export const connectorRegistry: Partial<Record<Platform, Connector<unknown>>> = {
  lead_dashboard: leadDashboardConnector as Connector<unknown>,
  search_console: searchConsoleConnector as Connector<unknown>,
  google_ads: googleAdsConnector as Connector<unknown>,
  ga4: ga4Connector as Connector<unknown>,
  ahrefs: ahrefsConnector as Connector<unknown>,
  openphone: openPhoneConnector as Connector<unknown>,
  ghl: ghlConnector as Connector<unknown>,
  meta: metaConnector as Connector<unknown>,
};
