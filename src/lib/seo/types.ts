import type { CellState } from "../dashboard/types";
import type { Tier, Trend } from "./compute";

// One month's worth of Search-Console-derived numbers for one client.
// CellState so a real absence (never synced this month, or search_console
// itself returned no_data for every day in it) stays distinct from a real
// zero — same discipline as the main dashboard.
export interface SeoMonthCell {
  month: string; // "YYYY-MM"
  clicks: CellState<number>;
  impressions: CellState<number>;
  avgPosition: CellState<number>;
}

export interface SeoClientRow {
  clientId: string;
  clientName: string;
  months: SeoMonthCell[]; // oldest -> newest, length MONTHS_SHOWN
  tier: Tier;
  trend: Trend;
  momPct: number | null;
  avg3: number | null;
  // Ahrefs-derived, latest available snapshot in the window.
  organicKeywords: CellState<number>;
  organicKeywordsTop3: CellState<number>;
  keywordsGained: CellState<number>;
  keywordsLost: CellState<number>;
  referringDomains: CellState<number>;
  newReferringDomains: number | null;
  // Editorial fields — current month, human-entered.
  seoOwner: string | null;
  status: string | null;
  notes: string | null;
  prevMonthSummary: string | null; // last month's `notes`, read directly
}

export interface SeoPortfolioAggregates {
  tierCounts: Record<Tier, number>;
  portfolioMomPct: number | null;
  portfolio3moPct: number | null;
  newReferringDomainsSum: number;
}

export interface SeoDashboardData {
  generatedAt: Date;
  months: string[]; // the 3 "YYYY-MM" keys shown, oldest -> newest
  rows: SeoClientRow[];
  aggregates: SeoPortfolioAggregates;
}
