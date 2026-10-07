import type { Platform } from "../connectors/types";

// AI client analysis: one report per client per run (monthly or on demand).
// The numbers come from facts.ts (computed in code from synced snapshots);
// the model only explains them and suggests what to do.

export type AnalysisKind = "monthly" | "on_demand";
export type Priority = "high" | "medium" | "low";
export type Effort = "quick" | "medium" | "big";
export type AccountStatus = "good" | "watch" | "problem";
export type RecommendationStatus = "open" | "done" | "dismissed";

export interface AnalysisRecommendation {
  id: string;
  title: string;
  detail: string;
  priority: Priority;
  impact: string;
  effort: Effort;
  status: RecommendationStatus;
  statusAt: string | null;
}

export interface AccountAnalysis {
  platform: Platform;
  status: AccountStatus;
  headline: string;
  whatChanged: string;
  likelyCauses: string[];
  recommendations: AnalysisRecommendation[];
}

export interface CrossChannelInsight {
  title: string;
  detail: string;
}

// Earlier recommendations the team ticked off or turned down, carried from
// report to report so the AI doesn't suggest them again.
export interface AnalysisHistoryEntry {
  title: string;
  status: "done" | "dismissed";
  at: string;
}

// One metric as shown to the model and in the report: this period, the one
// before, and the change. Computed in code, never by the model.
export interface MetricFact {
  label: string;
  unit: "count" | "currency" | "percent" | "position" | "number";
  current: number | null;
  previous: number | null;
  // Fraction (0.12 = +12%); null when either side is missing or zero.
  change: number | null;
  // For metrics where lower is better (cost per lead, missed-call rate,
  // search position).
  lowerIsBetter?: boolean;
}

export interface PlatformFacts {
  platform: Platform;
  label: string;
  // Days with data in the current / previous period.
  daysWithData: number;
  previousDaysWithData: number;
  metrics: MetricFact[];
  // Extra context lines: top queries gained/lost, traffic sources, etc.
  notes: string[];
  // Weekly totals of the account's main metric, oldest first (up to 13).
  weekly: { label: string; values: (number | null)[] } | null;
  problem: string | null;
}

export interface ClientFacts {
  clientId: string;
  clientName: string;
  period: { start: string; end: string; label: string };
  previousPeriod: { start: string; end: string };
  platforms: PlatformFacts[];
  // Connected accounts with no data in the period.
  quietAccounts: string[];
}

export interface StoredAnalysis {
  version: 1;
  healthScore: number;
  headline: string;
  summary: string;
  accounts: AccountAnalysis[];
  crossChannel: CrossChannelInsight[];
  facts: ClientFacts;
  history: AnalysisHistoryEntry[];
  // The AI model that wrote it.
  model?: string;
}

export interface AnalysisRow {
  id: string;
  clientId: string;
  kind: AnalysisKind;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  createdBy: string;
  report: StoredAnalysis;
}

export interface AnalysisListEntry {
  id: string;
  kind: AnalysisKind;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  healthScore: number;
}
