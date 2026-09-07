import { SparklesIcon, TrendingUpIcon } from "lucide-react";
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
  const leadsForecasts = sortByTrend(forecasts.filter((f) => f.metric.key === "leads"));
  const spendForecasts = sortByTrend(forecasts.filter((f) => f.metric.key === "spend"));

  return (
    <div className="mx-auto flex w-full max-w-[1400px] animate-in flex-col gap-8 px-6 py-8 fade-in-0 duration-300">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <SparklesIcon className="size-5 text-primary" aria-hidden />
          Insights
        </h1>
        <p className="text-sm text-muted-foreground">
          Rule-based attention flags, an AI-narrated summary, and a short-term forecast — all grounded in the same
          data as the dashboard. Ask the assistant (sparkles icon, top right) about any client.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Needs attention
            {flags.length > 0 && (
              <Badge variant="outline" className="h-4 border-amber-600/30 px-1.5 text-[10px] text-amber-700 dark:text-amber-500">
                {flags.length}
              </Badge>
            )}
          </h2>
          <AttentionFlags flags={flags} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Summary</h2>
          <AiSummary />
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <TrendingUpIcon className="size-3.5" aria-hidden />
            Forecast — next {FORECAST_DAYS} days (from the last {SPARKLINE_DAYS})
          </h2>
        </div>

        <Tabs defaultValue="leads">
          <TabsList>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="spend">Spend</TabsTrigger>
          </TabsList>

          <TabsContent value="leads">
            {leadsForecasts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active clients to forecast.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {leadsForecasts.map((f) => (
                  <ForecastChart key={f.clientId} clientName={f.clientName} metric={f.metric} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="spend">
            {spendForecasts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active clients to forecast.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {spendForecasts.map((f) => (
                  <ForecastChart key={f.clientId} clientName={f.clientName} metric={f.metric} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
