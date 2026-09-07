import Link from "next/link";
import { listClients } from "@/lib/settings/queries";
import { getSyncStatus } from "@/lib/dashboard/queries";
import { deactivateClient } from "../../actions";
import { Button } from "@/components/ui/button";
import { SyncStatusStrip } from "@/components/dashboard/sync-status-strip";
import { SyncNowButton } from "@/components/settings/sync-now-button";
import { ClientsList } from "@/components/settings/clients-list";

export const dynamic = "force-dynamic";
// Rate-limited connectors mean "Sync now" can genuinely take minutes —
// matches the cron route's budget (src/app/api/cron/sync/route.ts).
export const maxDuration = 300;

export default async function ClientsListPage() {
  const now = new Date();
  const [clients, syncStatus] = await Promise.all([listClients(), getSyncStatus(now)]);

  return (
    <div className="flex animate-in flex-col gap-6 fade-in-0 duration-300">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-medium text-foreground">Sync</h2>
          <SyncNowButton />
        </div>
        <SyncStatusStrip data={syncStatus} now={now} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-foreground">Clients</h2>
            <p className="text-sm text-muted-foreground">Client identity and platform account mappings.</p>
          </div>
          <Button asChild size="sm">
            <Link href="/settings/clients/new">Add client</Link>
          </Button>
        </div>

        <ClientsList clients={clients} deactivateClient={deactivateClient} />
      </div>
    </div>
  );
}
