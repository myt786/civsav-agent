import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, SettingsIcon } from "lucide-react";
import { getClientPage } from "@/lib/dashboard/views";
import {
  overviewReturn,
  param,
  rowCoverage,
  type SearchParams,
} from "@/lib/dashboard/portfolio";
import {
  formatCurrency,
  formatInteger,
  formatPosition,
  formatRelativeTime,
} from "@/lib/dashboard/format";
import { PLATFORM_LABELS } from "@/lib/dashboard/constants";
import { HealthLabel } from "@/components/workspace-ui";
import { Button } from "@/components/ui/button";
import { DataCell } from "@/components/dashboard/data-cell";
import { ClientIssues } from "@/components/dashboard/client-issues";
import { FleetTrendChart } from "@/components/dashboard/fleet-trend-chart";
import type { CellState } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client detail" };
export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const now = new Date();
  const data = await getClientPage(id, now);
  if (!data) notFound();
  const { row, detail, flags, health } = data;
  const coverage = rowCoverage(row);
  const missed: CellState<number> =
    row.calls.kind === "ok" || row.calls.kind === "unverified"
      ? { kind: row.calls.kind, value: row.calls.value.missed }
      : row.calls;
  const calls: CellState<number> =
    row.calls.kind === "ok" || row.calls.kind === "unverified"
      ? { kind: row.calls.kind, value: row.calls.value.total }
      : row.calls;
  const metrics = [
    { title: "Leads", cell: row.leads, format: formatInteger },
    { title: "Ad spend", cell: row.spend, format: formatCurrency },
    { title: "Cost per lead", cell: row.cpl, format: formatCurrency },
    { title: "Calls", cell: calls, format: formatInteger },
    { title: "Missed calls", cell: missed, format: formatInteger },
    { title: "Website sessions", cell: row.sessions, format: formatInteger },
    { title: "Conversions", cell: row.conversions, format: formatInteger },
    {
      title: "Avg. search position",
      cell: row.avgPosition,
      format: formatPosition,
    },
  ];
  return (
    <div className="workspace">
      <nav aria-label="Breadcrumb">
        <Link
          href={overviewReturn(param(search, "from"))}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to client overview
        </Link>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Client workspace</p>
          <h1 className="page-title">{row.clientName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <HealthLabel health={health} />
            <span className="text-xs text-muted-foreground">
              {coverage.available}/{coverage.total} metrics available
              {coverage.unverified ? " · includes unverified data" : ""}
            </span>
          </div>
        </div>
        <Button asChild variant="outline" className="bg-card">
          <Link href={`/settings/clients/${id}`}>
            <SettingsIcon className="size-4" />
            Client settings
          </Link>
        </Button>
      </header>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-3 text-[11px] text-muted-foreground">
        <span>
          Reporting period: last 7 full days, in the client’s timezone
        </span>
        <span>
          Last successful sync:{" "}
          {row.lastSyncedAt
            ? formatRelativeTime(row.lastSyncedAt, now)
            : "Not yet synced"}
        </span>
        {row.lastAttemptAt && (
          <span>
            Latest attempt: {formatRelativeTime(row.lastAttemptAt, now)}
          </span>
        )}
      </div>
      <ClientIssues flags={flags} clientId={id} />
      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="section-title">Performance at a glance</h2>
          <Link
            href="/docs#numbers"
            className="text-xs text-muted-foreground hover:text-primary"
          >
            Reading these numbers ↗
          </Link>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-4">
          {metrics.map((m) => (
            <div
              key={m.title}
              className="border-b border-r border-border px-5 py-5"
            >
              <p className="mb-3 text-xs text-muted-foreground">{m.title}</p>
              <div className="text-2xl font-medium tracking-tight">
                <DataCell state={m.cell} format={m.format} align="start" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-4">
          <h2 className="section-title">A closer look</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Daily trends over the last 30 days · gaps indicate missing data
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {detail.sparklines.map((series) => (
            <article
              key={series.key}
              id={series.key}
              className="panel scroll-mt-6 p-5"
            >
              <h3 className="mb-4 text-sm font-semibold">
                {series.label}
                {series.key === "avgPosition" && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Lower is better
                  </span>
                )}
              </h3>
              <FleetTrendChart
                title={series.label}
                points={series.points}
                color={
                  series.key === "callsMissed"
                    ? "var(--destructive)"
                    : "var(--chart-1)"
                }
                formatKind={
                  series.key === "spend"
                    ? "currency"
                    : series.key === "avgPosition"
                      ? "position"
                      : "integer"
                }
              />
            </article>
          ))}
        </div>
      </section>
      <section id="connections" className="panel scroll-mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="section-title">Behind the numbers</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Source breakdown · last 7 full days
            </p>
          </div>
          <Link
            href={`/settings/clients/${id}?tab=connections`}
            className="quiet-link"
          >
            Manage connections ↗
          </Link>
        </div>
        <div className="divide-y divide-border">
          {detail.breakdown.map((item) => (
            <div
              key={`${item.platform}-${item.label}`}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
            >
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PLATFORM_LABELS[item.platform]}
                </p>
              </div>
              <DataCell
                state={item.cell}
                format={
                  item.unit === "currency"
                    ? formatCurrency
                    : item.unit === "position"
                      ? formatPosition
                      : formatInteger
                }
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
