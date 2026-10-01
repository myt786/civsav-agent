import Link from "next/link";
import { ActivityIcon, AlertTriangleIcon, DollarSignIcon, UsersIcon } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard/queries";
import { computeAttentionFlags } from "@/lib/insights/rules";
import { buildFleetDailySeries, countWithValue, sumOkOrUnverified, weekOverWeekPct } from "@/lib/dashboard/aggregate";
import { formatInteger } from "@/lib/dashboard/format";
import { isDataFlag } from "@/lib/insights/data-issues";
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
  const sessionsTrend = buildFleetDailySeries(data.details, "sessions");
  const totalEnquiries = sumOkOrUnverified(data.rows, (r) => r.conversions);

  const plural = (n: number, word: string) => `${formatInteger(n)} ${word}${n === 1 ? "" : "s"}`;
  const dataProblemClients = new Set(flags.filter(isDataFlag).map((f) => f.clientId)).size;
  const performanceClients = new Set(flags.filter((f) => !isDataFlag(f)).map((f) => f.clientId)).size;
  const attentionHint =
    attentionCount === 0
      ? "Nothing needs a look right now"
      : [
          dataProblemClients > 0 ? `${dataProblemClients} not updating` : null,
          performanceClients > 0 ? `${performanceClients} with a change in numbers` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-[1400px] animate-in flex-col gap-6 px-6 py-8 fade-in-0 duration-300">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Client performance</h1>
        <p className="text-sm text-muted-foreground">
          Your clients&apos; numbers from every platform, updated daily.{" "}
          <Link href="/docs#numbers" className="text-primary hover:underline">
            How to read this page
          </Link>
        </p>
      </header>

      <StatCards
        stats={[
          {
            label: "Leads (last 7 days)",
            value: totalLeads,
            formatKind: "integer",
            icon: <UsersIcon className="size-3.5" aria-hidden />,
            changePct: weekOverWeekPct(leadsTrend),
            hint: `from ${plural(countWithValue(data.rows, (r) => r.leads), "client")}`,
            trend: leadsTrend.map((p) => p.value),
            trendColor: "var(--chart-1)",
          },
          {
            label: "Ad spend (last 7 days)",
            value: totalSpend,
            formatKind: "currency",
            icon: <DollarSignIcon className="size-3.5" aria-hidden />,
            changePct: weekOverWeekPct(spendTrend),
            changeTone: "neutral",
            hint: `${plural(countWithValue(data.rows, (r) => r.spend), "client")} running ads`,
            trend: spendTrend.map((p) => p.value),
            trendColor: "var(--chart-3)",
          },
          {
            label: "Website visits (last 7 days)",
            value: totalSessions,
            formatKind: "integer",
            icon: <ActivityIcon className="size-3.5" aria-hidden />,
            changePct: weekOverWeekPct(sessionsTrend),
            hint: totalEnquiries !== null ? `${formatInteger(totalEnquiries)} ${totalEnquiries === 1 ? "enquiry" : "enquiries"}` : undefined,
            trend: sessionsTrend.map((p) => p.value),
            trendColor: "var(--chart-2)",
          },
          {
            label: "Needs attention",
            value: attentionCount,
            formatKind: "integer",
            icon: <AlertTriangleIcon className="size-3.5" aria-hidden />,
            tone: attentionCount > 0 ? "warning" : "default",
            href: "/insights",
            hint: attentionHint,
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
