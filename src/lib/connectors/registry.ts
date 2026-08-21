import type { Connector, Platform } from "./types";
import { leadDashboardConnector } from "./lead-dashboard";
import { searchConsoleConnector } from "./search-console";
import { googleAdsConnector } from "./google-ads";

// Platforms are added here as their connectors are built, without touching
// the contract.
export const connectorRegistry: Partial<Record<Platform, Connector<unknown>>> = {
  lead_dashboard: leadDashboardConnector as Connector<unknown>,
  search_console: searchConsoleConnector as Connector<unknown>,
  google_ads: googleAdsConnector as Connector<unknown>,
};
