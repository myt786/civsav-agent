import Link from "next/link";
import { getDashboardData } from "@/lib/dashboard/queries";
import { buildLeadsForecasts, computeAttentionFlags } from "@/lib/insights/rules";
import { NOISE_BAND_PCT, SPARKLINE_DAYS } from "@/lib/dashboard/constants";
import { NavBrand } from "@/components/nav-brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { AttentionFlags } from "@/components/insights/attention-flags";
import { AiSummary } from "@/components/insights/ai-summary";
import { ForecastChart } from "@/components/insights/forecast-chart";
import { ChatPanel } from "@/components/insights/chat-panel";

// Same reasoning as the main dashboard: this reads live DB state on every
// request and must never be frozen into a static build-time snapshot.
export const dynamic = "force-dynamic";

const FORECAST_DAYS = 7;

export default async function InsightsPage() {
  const now = new Date();
  const data = await getDashboardData(now);
  const flags = computeAttentionFlags(data);
  const leadsForecasts = buildLeadsForecasts(data, FORECAST_DAYS, NOISE_BAND_PCT);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-3">
          <NavBrand />
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground hover:underline">
              Dashboard
            </Link>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground hover:underline">
              Docs
            </Link>
            <Link href="/settings/clients" className="text-muted-foreground hover:text-foreground hover:underline">
              Settings
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-foreground">Insights</h1>
          <p className="text-sm text-muted-foreground">
            Rule-based attention flags, an AI-narrated summary, a short-term lead forecast, and a chat you can ask about any
            client — all grounded in the same data as the dashboard.
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

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Lead forecast — next {FORECAST_DAYS} days (from the last {SPARKLINE_DAYS})
          </h2>
          {leadsForecasts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active clients to forecast.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {leadsForecasts.map((f) => (
                <ForecastChart key={f.clientId} clientName={f.clientName} metric={f.metric} />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Chat</h2>
          <ChatPanel />
        </section>
      </div>
    </div>
  );
}
