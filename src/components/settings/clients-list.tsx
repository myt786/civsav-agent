import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/settings/confirm-submit-button";
import { EmptyState } from "@/components/workspace-ui";

interface ClientListItem {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
}
export function ClientsList({
  clients,
  deactivateClient,
}: {
  clients: ClientListItem[];
  deactivateClient: (clientId: string) => Promise<void>;
}) {
  if (!clients.length)
    return (
      <EmptyState
        title="No clients to display"
        description="Try another filter, or add a client to get started."
        href="/settings/clients/new"
        action="Add client"
      />
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Client directory and configuration
        </caption>
        <thead className="border-y border-border bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">
              Client
            </th>
            <th
              scope="col"
              className="hidden px-5 py-3 font-medium sm:table-cell"
            >
              Timezone
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="hidden sm:table-cell">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {clients.map((client) => (
            <tr key={client.id} className="hover:bg-muted/30">
              <td className="px-5 py-5">
                <Link
                  prefetch={false}
                  href={`/settings/clients/${client.id}`}
                  className="font-medium hover:text-primary"
                >
                  {client.name}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                  {client.timezone.replaceAll("_", " ")}
                </p>
              </td>
              <td className="hidden px-5 py-5 text-xs text-muted-foreground sm:table-cell">
                {client.timezone.replaceAll("_", " ")}
              </td>
              <td className="px-5 py-5">
                <span
                  className={`health-label ${client.active ? "health-clear" : "health-insufficient"}`}
                >
                  {client.active ? "Active" : "Inactive"}
                </span>
              </td>
              <td className="hidden pr-5 sm:table-cell">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
