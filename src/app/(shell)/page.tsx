import Link from "next/link";
import { ActivityIcon, AlertTriangleIcon, DollarSignIcon, UsersIcon } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard/queries";
import { computeAttentionFlags } from "@/lib/insights/rules";
import { buildFleetDailySeries, sumOkOrUnverified } from "@/lib/dashboard/aggregate";
import { SyncStatusStrip } from "@/components/dashboard/sync-status-strip";
import { ClientsTable } from "@/components/dashboard/clients-table";
import { StatCards } from "@/components/dashboard/stat-cards";
import { FleetTrendChart } from "@/components/dashboard/fleet-trend-chart";

// Next can't see into the Drizzle calls inside getDashboardData() to know
// this page depends on live data, so without this it gets prerendered once
// at build time and every visitor would see that one frozen snapshot
// forever — exactly the "stale data looks current" failure mode this tool
// exists to avoid. Force a fresh read on every request instead.
export const dynamic = "force-dynamic";

// Server component only — reads Drizzle directly, no API route, no
// client-side fetching. Every interactive piece downstream (sorting, the
// row-expand sheet) operates on data already fetched here, never on a
// re-fetch.
export default async function DashboardPage() {
  const now = new Date();
  const data = await getDashboardData(now);
  const flags = computeAttentionFlags(data);

  const totalLeads = sumOkOrUnverified(data.rows, (r) => r.leads);
  const totalSpend = sumOkOrUnverified(data.rows, (r) => r.spend);
  const totalSessions = sumOkOrUnverified(data.rows, (r) => r.sessions);
  const attentionCount = new Set(flags.map((f) => f.clientId)).size;

  const leadsTrend = buildFleetDailySeries(data.details, "leads");
  const spendTrend = buildFleetDailySeries(data.details, "spend");

  return (
    <div className="mx-auto flex w-full max-w-[1400px] animate-in flex-col gap-6 px-6 py-8 fade-in-0 duration-300">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Client performance</h1>
        <p className="text-sm text-muted-foreground">
          Read-only daily snapshot across every connected platform.{" "}
          <Link href="/docs#numbers" className="text-primary hover:underline">
            What do these mean?
          </Link>
        </p>
      </header>

      <StatCards
        stats={[
          { label: "Leads (7d)", value: totalLeads, formatKind: "integer", icon: <UsersIcon className="size-3.5" aria-hidden /> },
          {
            label: "Spend (7d)",
            value: totalSpend,
            formatKind: "currency",
            icon: <DollarSignIcon className="size-3.5" aria-hidden />,
          },
          {
            label: "Sessions (7d)",
            value: totalSessions,
            formatKind: "integer",
            icon: <ActivityIcon className="size-3.5" aria-hidden />,
          },
          {
            label: "Needs attention",
            value: attentionCount,
            formatKind: "integer",
            icon: <AlertTriangleIcon className="size-3.5" aria-hidden />,
            tone: attentionCount > 0 ? "warning" : "default",
            href: "/insights",
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FleetTrendChart title="Leads — last 30 days" points={leadsTrend} color="var(--chart-1)" formatKind="integer" />
        <FleetTrendChart title="Spend — last 30 days" points={spendTrend} color="var(--chart-3)" formatKind="currency" />
      </div>

      <SyncStatusStrip data={data.syncStatus} now={now} />

      <ClientsTable rows={data.rows} details={data.details} now={now} flags={flags} />
    </div>
  );
}
