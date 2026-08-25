import Link from "next/link";
import { listClients } from "@/lib/settings/queries";
import { getSyncStatus } from "@/lib/dashboard/queries";
import { deactivateClient } from "../../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmSubmitButton } from "@/components/settings/confirm-submit-button";
import { SyncStatusStrip } from "@/components/dashboard/sync-status-strip";
import { SyncNowButton } from "@/components/settings/sync-now-button";

export const dynamic = "force-dynamic";
// Rate-limited connectors mean "Sync now" can genuinely take minutes —
// matches the cron route's budget (src/app/api/cron/sync/route.ts).
export const maxDuration = 300;

export default async function ClientsListPage() {
  const now = new Date();
  const [clients, syncStatus] = await Promise.all([listClients(), getSyncStatus(now)]);

  return (
    <div className="flex flex-col gap-6">
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

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-1" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <Link href={`/settings/clients/${client.id}`} className="font-medium text-foreground hover:underline">
                      {client.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{client.timezone}</TableCell>
                  <TableCell>
                    {client.active ? (
                      <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-500">
                        active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                        inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.active && (
                      <form action={deactivateClient.bind(null, client.id)}>
                        <ConfirmSubmitButton
                          type="submit"
                          size="sm"
                          variant="ghost"
                          confirmMessage={`Deactivate ${client.name}? This excludes it from future syncs but keeps its history.`}
                        >
                          Deactivate
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No clients yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
