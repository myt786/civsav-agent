import { notFound } from "next/navigation";
import { getClient, getClientMappings } from "@/lib/settings/queries";
import { getRecentChanges } from "@/lib/settings/audit";
import { getAllDiscoveredAccounts } from "@/lib/connectors/discovery-cache";
import { ClientForm } from "@/components/settings/client-form";
import { MappingsSection } from "@/components/settings/mappings-section";
import { updateClient } from "../../../actions";

export const dynamic = "force-dynamic";

function formatChangeValue(value: string | null): string {
  if (value === null) return "(none)";
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, mappings, changes, discovery] = await Promise.all([
    getClient(id),
    getClientMappings(id),
    getRecentChanges(id),
    getAllDiscoveredAccounts(),
  ]);
  if (!client) notFound();

  const mappingByPlatform = new Map(
    mappings.map((m) => [
      m.platform,
      {
        externalId: m.externalId,
        active: m.active,
        credentialLabel: m.credentialLabel,
        verifiedAt: m.verifiedAt,
        verifiedStatus: m.verifiedStatus,
        lastError: m.lastError,
      },
    ]),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-foreground">{client.name}</h2>
        <p className="text-sm text-muted-foreground">Client details and platform account mappings.</p>
      </div>

      <section className="max-w-md rounded-lg border border-border p-4">
        <ClientForm
          action={updateClient.bind(null, client.id)}
          defaultValues={{ name: client.name, timezone: client.timezone, active: client.active }}
          submitLabel="Save changes"
        />
      </section>

      <MappingsSection
        clientId={client.id}
        clientName={client.name}
        initialDiscovery={discovery}
        mappingByPlatform={mappingByPlatform}
      />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Recent changes</h3>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {changes.map((change) => (
              <li key={change.id} className="text-muted-foreground">
                <span className="text-foreground">{change.userEmail}</span> changed{" "}
                <span className="font-mono text-xs">
                  {change.platform ? `${change.platform}.` : ""}
                  {change.field}
                </span>{" "}
                from <span className="font-mono text-xs">{formatChangeValue(change.oldValue)}</span> to{" "}
                <span className="font-mono text-xs">{formatChangeValue(change.newValue)}</span> —{" "}
                {change.changedAt.toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
