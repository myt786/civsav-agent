import { GaugeIcon, LinkIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { getSeoDashboardData } from "@/lib/seo/queries";
import { StatCards } from "@/components/dashboard/stat-cards";
import { SeoPortfolioTable } from "@/components/seo/seo-portfolio-table";

// Same reasoning as the main dashboard page: this reads Drizzle directly,
// so without forcing a fresh render every visitor sees one frozen build-
// time snapshot forever.
export const dynamic = "force-dynamic";

export default async function SeoDashboardPage() {
  const data = await getSeoDashboardData();
  const { aggregates } = data;
  const minZero = aggregates.tierCounts.minimal + aggregates.tierCounts.no_data;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] animate-in flex-col gap-6 px-6 py-8 fade-in-0 duration-300">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">SEO portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Search Console + Ahrefs, rolled up by client — {data.months[0]} through {data.months[data.months.length - 1]}.
        </p>
      </header>

      <StatCards
        stats={[
          {
            label: "Strong tier",
            value: aggregates.tierCounts.strong,
            formatKind: "integer",
            icon: <TrendingUpIcon className="size-3.5" aria-hidden />,
          },
          {
            label: "Moderate tier",
            value: aggregates.tierCounts.moderate,
            formatKind: "integer",
            icon: <GaugeIcon className="size-3.5" aria-hidden />,
          },
          {
            label: "Small tier",
            value: aggregates.tierCounts.small,
            formatKind: "integer",
            icon: <UsersIcon className="size-3.5" aria-hidden />,
          },
          {
            label: "Min / no data",
            value: minZero,
            formatKind: "integer",
            icon: <UsersIcon className="size-3.5" aria-hidden />,
            tone: minZero > 0 ? "warning" : "default",
          },
          {
            label: "New referring domains",
            value: aggregates.newReferringDomainsSum,
            formatKind: "integer",
            icon: <LinkIcon className="size-3.5" aria-hidden />,
          },
        ]}
      />

      <SeoPortfolioTable rows={data.rows} months={data.months} />
    </div>
  );
}
