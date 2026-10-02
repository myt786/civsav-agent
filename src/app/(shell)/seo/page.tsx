import { KeyRoundIcon, LayersIcon, LinkIcon, MousePointerClickIcon, TrendingUpIcon } from "lucide-react";
import { formatInteger } from "@/lib/dashboard/format";
import { getSeoDashboardData, getSeoRecommendations } from "@/lib/seo/queries";
import { StatCards } from "@/components/dashboard/stat-cards";
import { SeoPortfolioTable } from "@/components/seo/seo-portfolio-table";
import { SeoRecommendationsTab } from "@/components/seo/seo-recommendations-tab";
import { UnsyncedNotice } from "@/components/seo/unsynced-notice";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Same reasoning as the main dashboard page: this reads Drizzle directly,
// so without forcing a fresh render every visitor sees one frozen build-
// time snapshot forever.
export const dynamic = "force-dynamic";

export default async function SeoDashboardPage() {
  const data = await getSeoDashboardData();
  const recommendations = await getSeoRecommendations(data.rows);
  const { aggregates } = data;
  const tc = aggregates.tierCounts;
  const minZero = tc.minimal + tc.no_data;
  const value = (cell: { kind: string; value?: number }) =>
    (cell.kind === "ok" || cell.kind === "unverified") && typeof cell.value === "number" ? cell.value : null;

  // Portfolio clicks per month (all clients), oldest -> newest, for the
  // card's number and its small 3-month line.
  const monthTotals = data.months.map((_, i) => {
    const values = data.rows.map((r) => value(r.months[i].clicks)).filter((v): v is number => v !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
  });
  const newestTotal = monthTotals[monthTotals.length - 1];
  const newestMonthLabel = new Date(`${data.months[data.months.length - 1]}-01T00:00:00`).toLocaleString("en-US", {
    month: "long",
  });

  const growing = data.rows.filter((r) => r.trend === "growing" || r.trend === "growing_fast").length;
  const falling = data.rows.filter((r) => r.trend === "declining" || r.trend === "falling_fast").length;
  const stable = data.rows.filter((r) => r.trend === "stable").length;

  const keywordTotal = data.rows.reduce((sum, r) => sum + (value(r.organicKeywords) ?? 0), 0);
  const gained = data.rows.reduce((sum, r) => sum + (value(r.keywordsGained) ?? 0), 0);
  const lost = data.rows.reduce((sum, r) => sum + (value(r.keywordsLost) ?? 0), 0);
  const hasKeywords = data.rows.some((r) => value(r.organicKeywords) !== null);
  // Rows with genuinely nothing synced yet — a newly-onboarded client
  // whose search_console/ahrefs mappings haven't started reporting, not a
  // real "zero traffic" result. Surfaced as a banner rather than left to
  // look like 58 broken rows in the table below.
  const neverSyncedCount = data.rows.filter(
    (r) => r.tier === "no_data" && r.organicKeywords.kind === "no_data",
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] animate-in flex-col gap-6 px-6 py-8 fade-in-0 duration-300">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">SEO portfolio</h1>
          {aggregates.newReferringDomainsSum > 0 && (
            <Badge variant="outline" className="gap-1 border-success/30 text-success">
              <LinkIcon className="size-3" aria-hidden />+{aggregates.newReferringDomainsSum} new referring domains
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Each client&apos;s Google search performance (from Search Console and Ahrefs), {data.months[0]} to {data.months[data.months.length - 1]}.
        </p>
      </header>

      <UnsyncedNotice count={neverSyncedCount} />

      <StatCards
        stats={[
          {
            label: `Google clicks · ${newestMonthLabel}`,
            value: newestTotal,
            formatKind: "integer",
            icon: <MousePointerClickIcon className="size-3.5" aria-hidden />,
            changePct: aggregates.portfolioMomPct === null ? null : aggregates.portfolioMomPct * 100,
            changeLabel: "vs the month before",
            hint:
              aggregates.portfolio3moPct === null
                ? "all clients combined"
                : `${aggregates.portfolio3moPct >= 0 ? "+" : ""}${Math.round(aggregates.portfolio3moPct * 100)}% over 3 months`,
            trend: monthTotals,
            trendColor: "var(--chart-1)",
          },
          {
            label: "Clients growing",
            value: growing,
            formatKind: "integer",
            icon: <TrendingUpIcon className="size-3.5" aria-hidden />,
            hint: `${falling} falling · ${stable} steady (3-month trend)`,
            tone: falling > growing ? "warning" : "default",
          },
          {
            label: "Ranking keywords",
            value: hasKeywords ? keywordTotal : null,
            formatKind: "integer",
            icon: <KeyRoundIcon className="size-3.5" aria-hidden />,
            hint: hasKeywords ? `+${formatInteger(gained)} gained · −${formatInteger(lost)} lost this month (Ahrefs)` : "No Ahrefs data yet",
          },
          {
            label: "Strong or moderate",
            value: tc.strong + tc.moderate,
            formatKind: "integer",
            icon: <LayersIcon className="size-3.5" aria-hidden />,
            hint: `${tc.small} small · ${minZero} minimal or no data`,
            tone: minZero > data.rows.length / 2 ? "warning" : "default",
          },
        ]}
      />

      <Tabs defaultValue="portfolio">
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio">
          <SeoPortfolioTable rows={data.rows} months={data.months} />
        </TabsContent>

        <TabsContent value="recommendations">
          <SeoRecommendationsTab initialRows={recommendations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
