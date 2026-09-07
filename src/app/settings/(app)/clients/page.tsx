import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { getClientsDirectory } from "@/lib/settings/queries";
import { getSyncStatus } from "@/lib/dashboard/queries";
import { param, type SearchParams } from "@/lib/dashboard/portfolio";
import { deactivateClient } from "../../actions";
import { Button } from "@/components/ui/button";
import { SyncStatusStrip } from "@/components/dashboard/sync-status-strip";
import { SyncNowButton } from "@/components/settings/sync-now-button";
import { ClientsList } from "@/components/settings/clients-list";
import { FilterForm, Pagination } from "@/components/workspace-ui";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export default async function ClientsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const now = new Date();
  const [directory, syncStatus] = await Promise.all([
    getClientsDirectory(params),
    getSyncStatus(now),
  ]);
  return (
    <div className="flex flex-col gap-7">
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="section-title">Client directory</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Manage profiles, connected accounts, and access to daily syncs.
            </p>
          </div>
          <Button asChild>
            <Link href="/settings/clients/new">
              <PlusIcon className="size-4" />
              Add client
            </Link>
          </Button>
        </div>
        <div className="px-5 pb-5">
          <FilterForm path="/settings/clients" params={params}>
            <select
              key={param(params, "status")}
              name="status"
              aria-label="Client status"
              defaultValue={param(params, "status")}
              className="field-control"
            >
              <option value="">All clients</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FilterForm>
        </div>
        <ClientsList
          clients={directory.items}
          deactivateClient={deactivateClient}
        />
        <Pagination path="/settings/clients" params={params} {...directory} />
      </section>
      <section className="panel p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Data sync</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Check platform health or request a fresh sync for active clients.
            </p>
          </div>
          <SyncNowButton />
        </div>
        <SyncStatusStrip data={syncStatus} now={now} />
      </section>
    </div>
  );
}
