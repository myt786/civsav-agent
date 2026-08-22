import Link from "next/link";
import { getDashboardData } from "@/lib/dashboard/queries";
import { SyncStatusStrip } from "@/components/dashboard/sync-status-strip";
import { ClientsTable } from "@/components/dashboard/clients-table";

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

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium text-foreground">Client performance</h1>
          <p className="text-sm text-muted-foreground">Read-only daily snapshot across every connected platform.</p>
        </div>
        <Link href="/settings/clients" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          Settings
        </Link>
      </header>

      <SyncStatusStrip data={data.syncStatus} now={now} />

      <ClientsTable rows={data.rows} details={data.details} now={now} />
    </div>
  );
}
