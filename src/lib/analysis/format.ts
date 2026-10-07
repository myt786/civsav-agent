import { formatCurrency, formatInteger, formatPosition } from "../dashboard/format";
import type { AnalysisRecommendation, MetricFact, StoredAnalysis } from "./types";

// Shared by the AI prompt and the report UI, so both show a number the
// same way.
export function formatFactValue(m: Pick<MetricFact, "unit">, value: number | null): string {
  if (value === null) return "no data";
  switch (m.unit) {
    case "currency":
      return formatCurrency(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "position":
      return formatPosition(value);
    case "number":
      return value.toFixed(1);
    default:
      return formatInteger(value);
  }
}

export function formatChange(change: number | null): string | null {
  if (change === null) return null;
  const pct = Math.round(change * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

// Whether a change is good news, given the metric's direction.
export function changeTone(m: Pick<MetricFact, "change" | "lowerIsBetter">): "good" | "bad" | "flat" {
  if (m.change === null || Math.abs(m.change) < 0.03) return "flat";
  const up = m.change > 0;
  return up !== Boolean(m.lowerIsBetter) ? "good" : "bad";
}

// Every recommendation in a report — the leads section's and each
// account's — tagged with where it came from ("leads" or a platform).
export function allRecommendations(report: StoredAnalysis): (AnalysisRecommendation & { area: string })[] {
  return [
    ...(report.leads?.recommendations ?? []).map((r) => ({ ...r, area: "leads" })),
    ...(report.accounts ?? []).flatMap((a) => (a.recommendations ?? []).map((r) => ({ ...r, area: a.platform as string }))),
  ];
}

// The same report with one function applied to every recommendation.
export function mapRecommendations(
  report: StoredAnalysis,
  fn: (rec: AnalysisRecommendation) => AnalysisRecommendation,
): StoredAnalysis {
  return {
    ...report,
    leads: report.leads ? { ...report.leads, recommendations: report.leads.recommendations.map(fn) } : report.leads,
    accounts: report.accounts.map((a) => ({ ...a, recommendations: a.recommendations.map(fn) })),
  };
}
