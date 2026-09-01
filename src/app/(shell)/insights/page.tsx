import { SparklesIcon, TrendingUpIcon } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard/queries";
import { buildForecasts, computeAttentionFlags } from "@/lib/insights/rules";
import { NOISE_BAND_PCT, SPARKLINE_DAYS } from "@/lib/dashboard/constants";
import { AttentionFlags } from "@/components/insights/attention-flags";
import { AiSummary } from "@/components/insights/ai-summary";
import { ForecastChart } from "@/components/insights/forecast-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Same reasoning as the main dashboard: this reads live DB state on every
// request and must never be frozen into a static build-time snapshot.
export const dynamic = "force-dynamic";

const FORECAST_DAYS = 7;

export default async function InsightsPage() {
  const now = new Date();
  const data = await getDashboardData(now);
  const flags = computeAttentionFlags(data);
  const forecasts = buildForecasts(data, FORECAST_DAYS, NOISE_BAND_PCT);
  const leadsForecasts = forecasts.filter((f) => f.metric.key === "leads");
  const spendForecasts = forecasts.filter((f) => f.metric.key === "spend");

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
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Needs attention</h2>
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
