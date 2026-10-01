import Link from "next/link";
import { listClientsWithAccounts } from "@/lib/settings/queries";
import { getSyncStatus } from "@/lib/dashboard/queries";
import { deactivateClient } from "../../actions";
import { Button } from "@/components/ui/button";
import { SyncStatusStrip } from "@/components/dashboard/sync-status-strip";
import { SyncNowButton } from "@/components/settings/sync-now-button";
import { CheckAllAccountsButton } from "@/components/settings/check-all-accounts-button";
import { BackfillSearchConsoleButton } from "@/components/settings/backfill-search-console-button";
import { ClientsList } from "@/components/settings/clients-list";

export const dynamic = "force-dynamic";
// Rate-limited connectors mean "Sync now" can genuinely take minutes —
// matches the cron route's budget (src/app/api/cron/sync/route.ts).
export const maxDuration = 300;

export default async function ClientsListPage() {
  const now = new Date();
  const [clients, syncStatus] = await Promise.all([listClientsWithAccounts(), getSyncStatus()]);

  return (
    <div className="flex animate-in flex-col gap-10 fade-in-0 duration-300">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-lg font-medium text-foreground">Clients</h2>
            <p className="text-sm text-muted-foreground">
              Everyone we report on, and the accounts we pull their numbers from.
            </p>
          </div>
          <Button asChild>
            <Link href="/settings/clients/new">Add client</Link>
          </Button>
        </div>

        <ClientsList clients={clients} deactivateClient={deactivateClient} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-lg font-medium text-foreground">Data updates</h2>
            <p className="text-sm text-muted-foreground">
              Numbers update automatically every morning. Use these if you&apos;ve just fixed something.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CheckAllAccountsButton />
            <SyncNowButton />
          </div>
        </div>
        <SyncStatusStrip data={syncStatus} now={now} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Search Console publishes a few days late, so recent days can be missing. This fills them in.</span>
          <BackfillSearchConsoleButton />
        </div>
      </section>
    </div>
  );
}
