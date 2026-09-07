import Link from "next/link";
import { ArrowUpRightIcon, CalendarDaysIcon, PlusIcon } from "lucide-react";
import { getPortfolioPage } from "@/lib/dashboard/views";
import {
  HEALTH_LABELS,
  SORTS,
  param,
  queryHref,
  type Health,
  type SearchParams,
} from "@/lib/dashboard/portfolio";
import { formatCurrency, formatInteger } from "@/lib/dashboard/format";
import { PortfolioTable } from "@/components/dashboard/portfolio-table";
import { PortfolioTrend } from "@/components/dashboard/portfolio-trend";
import { SyncStatusStrip } from "@/components/dashboard/sync-status-strip";
import {
  EmptyState,
  FilterForm,
  PageHeader,
  Pagination,
} from "@/components/workspace-ui";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const now = new Date();
  const data = await getPortfolioPage(params, now);
  const health = param(params, "health");
  const coverage = (metric: typeof data.leads) =>
    `${metric.available} of ${metric.total} clients reporting${metric.unverified ? " · includes unverified" : ""}`;
  const summaries = [
    {
      label: "Active clients",
      value: formatInteger(data.activeClients),
      note: "Your connected portfolio",
      href: queryHref("/", {}, {}),
    },
    {
      label: "Needs attention",
      value: formatInteger(data.attentionClients),
      note: `${data.counts.critical} critical · ${data.counts.attention} to review`,
      href: "/insights",
      attention: true,
    },
    {
      label: "Leads this week",
      value: data.leads.value === null ? "—" : formatInteger(data.leads.value),
      note: coverage(data.leads),
    },
    {
      label: "Ad spend this week",
      value: data.spend.value === null ? "—" : formatCurrency(data.spend.value),
      note: coverage(data.spend),
    },
  ];
  return (
    <div className="workspace">
      <PageHeader
        eyebrow="Your portfolio, at a glance"
        title="Client overview"
        description="See where things stand. Know where to focus next."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDaysIcon className="size-4" />
            Last 7 full days
          </span>
          <Button asChild className="h-10">
            <Link href="/settings/clients/new">
              <PlusIcon className="size-4" />
              Add client
            </Link>
          </Button>
        </div>
      </PageHeader>
      <section
        aria-label="Portfolio summary"
        className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-4"
      >
        {summaries.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col px-5 py-6 lg:px-6 ${i !== 3 ? "lg:border-r" : ""} ${i < 2 ? "border-b lg:border-b-0" : ""} ${i % 2 === 0 ? "max-lg:border-r" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {s.label}
              </p>
              {s.href && (
                <Link
                  href={s.href}
                  aria-label={`View ${s.label.toLowerCase()}`}
                >
                  <ArrowUpRightIcon className="size-3.5 text-muted-foreground" />
                </Link>
              )}
            </div>
            <p
              className={`my-3 text-[32px] font-medium leading-none tracking-[-0.05em] ${s.attention && data.attentionClients ? "text-[#96600c]" : ""}`}
            >
              {s.value}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {s.note}
            </p>
          </div>
        ))}
      </section>
      <section
        className="panel overflow-hidden"
        aria-labelledby="clients-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div className="flex items-center gap-2.5">
            <h2 id="clients-heading" className="section-title">
              All clients
            </h2>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {data.activeClients}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Leads compared with the previous 7 days
          </span>
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5">
          <nav
            aria-label="Filter by client health"
            className="flex flex-wrap gap-1.5"
          >
            {[
              ["", "All", data.activeClients],
              ...Object.entries(HEALTH_LABELS).map(([key, label]) => [
                key,
                label,
                data.counts[key as Health],
              ]),
            ].map(([key, label, count]) => (
              <Link
                key={key}
                scroll={false}
                href={queryHref("/", params, { health: String(key), page: 1 })}
                aria-current={health === key ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-xs transition-colors ${health === key ? "bg-foreground text-white" : "text-muted-foreground hover:bg-muted"}`}
              >
                {label} <span className="ml-2 opacity-70">{count}</span>
              </Link>
            ))}
          </nav>
          <FilterForm path="/" params={params}>
            <select
              key={param(params, "sort")}
              name="sort"
              aria-label="Sort clients"
              defaultValue={param(params, "sort", "priority")}
              className="field-control"
            >
              {Object.entries(SORTS).map(([key, label]) => (
                <option key={key} value={key}>
                  Sort: {label}
                </option>
              ))}
            </select>
            <select
              key={`${param(params, "sort")}-${param(params, "dir")}`}
              name="dir"
              aria-label="Sort direction"
              defaultValue={param(
                params,
                "dir",
                ["priority", "client"].includes(
                  param(params, "sort", "priority"),
                )
                  ? "asc"
                  : "desc",
              )}
              className="field-control"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </FilterForm>
        </div>
        {data.items.length ? (
          <PortfolioTable entries={data.items} params={params} now={now} />
        ) : (
          <EmptyState
            title={
              data.activeClients
                ? "No clients match your filters"
                : "Your portfolio starts here"
            }
            description={
              data.activeClients
                ? "Try a different name or clear your filters to see every client."
                : "Add your first client and connect their platforms to start seeing performance and issues."
            }
            href={data.activeClients ? "/" : "/settings/clients/new"}
            action={
              data.activeClients ? "Clear filters" : "Add your first client"
            }
          />
        )}
        <Pagination path="/" params={params} {...data} />
      </section>
      <PortfolioTrend leads={data.leadsTrend} spend={data.spendTrend} />
      <details className="rounded-lg border border-border bg-card px-5 py-4">
        <summary className="text-xs font-medium text-muted-foreground">
          Data connections & sync status
        </summary>
        <div className="pt-5">
          <SyncStatusStrip data={data.syncStatus} now={now} />
          <p className="mt-3 text-xs text-muted-foreground">
            Data is collected daily.{" "}
            <Link href="/docs#freshness" className="quiet-link">
              Understand freshness
            </Link>
          </p>
        </div>
      </details>
      <footer className="flex justify-between text-[10px] text-muted-foreground">
        <span>Civsav · Agency workspace</span>
        <Link href="/docs#numbers" className="hover:text-foreground">
          How to read your numbers ↗
        </Link>
      </footer>
    </div>
  );
}
