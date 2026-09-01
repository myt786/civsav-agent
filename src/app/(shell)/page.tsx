import Link from "next/link";
import { ActivityIcon, AlertTriangleIcon, DollarSignIcon, UsersIcon } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard/queries";
import { computeAttentionFlags } from "@/lib/insights/rules";
import { sumOkOrUnverified } from "@/lib/dashboard/aggregate";
import { formatCurrency, formatInteger } from "@/lib/dashboard/format";
import { SyncStatusStrip } from "@/components/dashboard/sync-status-strip";
import { ClientsTable } from "@/components/dashboard/clients-table";
import { StatCards } from "@/components/dashboard/stat-cards";

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

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium text-foreground">Client performance</h1>
        <p className="text-sm text-muted-foreground">
          Read-only daily snapshot across every connected platform.{" "}
          <Link href="/docs#numbers" className="text-primary hover:underline">
            What do these mean?
          </Link>
        </p>
      </header>

      <StatCards
        stats={[
          { label: "Leads (7d)", value: totalLeads === null ? "—" : formatInteger(totalLeads), icon: UsersIcon },
          { label: "Spend (7d)", value: totalSpend === null ? "—" : formatCurrency(totalSpend), icon: DollarSignIcon },
          { label: "Sessions (7d)", value: totalSessions === null ? "—" : formatInteger(totalSessions), icon: ActivityIcon },
          {
            label: "Needs attention",
            value: formatInteger(attentionCount),
            icon: AlertTriangleIcon,
            tone: attentionCount > 0 ? "warning" : "default",
            href: "/insights",
          },
        ]}
      />

      <SyncStatusStrip data={data.syncStatus} now={now} />

      <ClientsTable rows={data.rows} details={data.details} now={now} flags={flags} />
    </div>
  );
}
