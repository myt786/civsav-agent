import { getDashboardData } from "@/lib/dashboard/queries";
import { buildForecasts, computeAttentionFlags } from "@/lib/insights/rules";
import { NOISE_BAND_PCT, SPARKLINE_DAYS } from "@/lib/dashboard/constants";
import { AttentionFlags } from "@/components/insights/attention-flags";
import { AiSummary } from "@/components/insights/ai-summary";
import { ForecastChart } from "@/components/insights/forecast-chart";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MetricForecast } from "@/lib/insights/types";

// Same reasoning as the main dashboard: this reads live DB state on every
// request and must never be frozen into a static build-time snapshot.
export const dynamic = "force-dynamic";

const FORECAST_DAYS = 7;

// Down-trending forecasts are the most actionable to spot at a glance —
// surfacing them first here complements (never duplicates) the Needs
// attention panel, which already flags a *statistically significant* drop.
// This is just an ordinary sort by direction, not another judgment call.
const TREND_PRIORITY: Record<MetricForecast["trend"], number> = { down: 0, flat: 1, up: 2, unknown: 3 };

function sortByTrend<T extends { metric: MetricForecast }>(items: T[]): T[] {
  return [...items].sort((a, b) => TREND_PRIORITY[a.metric.trend] - TREND_PRIORITY[b.metric.trend]);
}

export default async function InsightsPage() {
  const now = new Date();
  const data = await getDashboardData(now);
  const flags = computeAttentionFlags(data);
  const forecasts = buildForecasts(data, FORECAST_DAYS, NOISE_BAND_PCT);
  // A card with too little history to project from is just an empty box —
  // with ~60 clients most of the grid was those. Count them instead.
  const forecastable = (key: MetricForecast["key"]) => forecasts.filter((f) => f.metric.key === key && f.metric.trend !== "unknown");
  const notEnough = (key: MetricForecast["key"]) => forecasts.filter((f) => f.metric.key === key && f.metric.trend === "unknown").length;
  const leadsForecasts = sortByTrend(forecastable("leads"));
  const spendForecasts = sortByTrend(forecastable("spend"));
  // Clients, not flags: one client can have several flags, and the
  // dashboard's "Needs attention" card counts clients too.
  const attentionClients = new Set(flags.map((f) => f.clientId)).size;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] animate-in flex-col gap-8 px-6 py-8 fade-in-0 duration-300">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Insights</h1>
        <p className="text-sm text-muted-foreground">
          What needs your attention, a written summary, and what to expect over the next week.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Needs attention
            {attentionClients > 0 && (
              <Badge variant="outline" className="h-4 border-warning/30 px-1.5 text-[10px] text-warning">
                {attentionClients} {attentionClients === 1 ? "client" : "clients"}
              </Badge>
            )}
          </h2>
          <AttentionFlags flags={flags} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">This week in brief</h2>
          <AiSummary />
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            What to expect — next {FORECAST_DAYS} days (based on the last {SPARKLINE_DAYS} days)
          </h2>
        </div>

        <Tabs defaultValue="leads">
          <TabsList>
            <TabsTrigger value="leads">Leads ({leadsForecasts.length})</TabsTrigger>
            <TabsTrigger value="spend">Ad spend ({spendForecasts.length})</TabsTrigger>
          </TabsList>

          {(
            [
              ["leads", leadsForecasts, "leads"],
              ["spend", spendForecasts, "ad spend"],
            ] as const
          ).map(([key, items, noun]) => (
            <TabsContent key={key} value={key} className="flex flex-col gap-3">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No client has enough days of {noun} yet to project from.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((f) => (
                    <ForecastChart key={f.clientId} clientName={f.clientName} metric={f.metric} />
                  ))}
                </div>
              )}
              {notEnough(key) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {notEnough(key)} {notEnough(key) === 1 ? "client isn't" : "clients aren't"} shown — fewer than 5 days of{" "}
                  {noun} in the last {SPARKLINE_DAYS} days, which is too little to project from.
                </p>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}
