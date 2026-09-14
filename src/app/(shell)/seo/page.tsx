import { GaugeIcon, LinkIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { getSeoDashboardData } from "@/lib/seo/queries";
import { StatCards } from "@/components/dashboard/stat-cards";
import { SeoPortfolioTable } from "@/components/seo/seo-portfolio-table";
import { Badge } from "@/components/ui/badge";

// Same reasoning as the main dashboard page: this reads Drizzle directly,
// so without forcing a fresh render every visitor sees one frozen build-
// time snapshot forever.
export const dynamic = "force-dynamic";

export default async function SeoDashboardPage() {
  const data = await getSeoDashboardData();
  const { aggregates } = data;
  const minZero = aggregates.tierCounts.minimal + aggregates.tierCounts.no_data;
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
          Search Console + Ahrefs, rolled up by client — {data.months[0]} through {data.months[data.months.length - 1]}.
        </p>
      </header>

      {neverSyncedCount > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <span className="font-medium">{neverSyncedCount} client{neverSyncedCount === 1 ? "" : "s"} haven&rsquo;t synced yet.</span>{" "}
          That&rsquo;s expected for a newly-connected client — Search Console needs the app&rsquo;s service account granted
          access on the property, and Ahrefs only runs once a month. They&rsquo;ll fill in automatically once access is
          granted and a sync has run.
        </div>
      )}

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
        ]}
      />

      <SeoPortfolioTable rows={data.rows} months={data.months} />
    </div>
  );
}
