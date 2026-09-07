import "server-only";
import { getDashboardData } from "./queries";
import { buildFleetDailySeries } from "./aggregate";
import { buildForecasts, computeAttentionFlags } from "../insights/rules";
import { NOISE_BAND_PCT } from "./constants";
import {
  clientHealth,
  pageNumber,
  pageSlice,
  param,
  selectIssues,
  selectPortfolio,
  type SearchParams,
} from "./portfolio";

export async function getPortfolioPage(params: SearchParams, now = new Date()) {
  const data = await getDashboardData(now);
  return {
    ...selectPortfolio(data, params),
    syncStatus: data.syncStatus,
    leadsTrend: buildFleetDailySeries(data.details, "leads"),
    spendTrend: buildFleetDailySeries(data.details, "spend"),
    generatedAt: data.generatedAt,
  };
}
export async function getClientPage(clientId: string, now = new Date()) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      clientId,
    )
  )
    return null;
  const data = await getDashboardData(now, clientId);
  const row = data.rows[0];
  if (!row) return null;
  const flags = computeAttentionFlags(data);
  return {
    row,
    detail: data.details[clientId],
    flags,
    health: clientHealth(row, flags),
  };
}
export async function getIssuePage(params: SearchParams, now = new Date()) {
  return selectIssues(await getDashboardData(now), params);
}
export async function getForecastPage(params: SearchParams, now = new Date()) {
  const data = await getDashboardData(now);
  const metric = param(params, "metric") === "spend" ? "spend" : "leads";
  const q = param(params, "q").trim().toLowerCase();
  const forecasts = buildForecasts(data, 7, NOISE_BAND_PCT).filter(
    (f) => f.metric.key === metric && f.clientName.toLowerCase().includes(q),
  );
  const priority = { down: 0, flat: 1, up: 2, unknown: 3 };
  forecasts.sort(
    (a, b) =>
      priority[a.metric.trend] - priority[b.metric.trend] ||
      a.clientName.localeCompare(b.clientName),
  );
  return pageSlice(forecasts, pageNumber(params), 12);
}
