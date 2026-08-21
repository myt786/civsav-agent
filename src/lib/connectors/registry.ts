import type { Connector, Platform } from "./types";
import { leadDashboardConnector } from "./lead-dashboard";

// Only lead_dashboard is registered so far — the other 7 platforms will be
// added here as their connectors are built, without touching the contract.
export const connectorRegistry: Partial<Record<Platform, Connector<unknown>>> = {
  lead_dashboard: leadDashboardConnector as Connector<unknown>,
};
