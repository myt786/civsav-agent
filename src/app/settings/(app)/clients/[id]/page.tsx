import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getClientMappings } from "@/lib/settings/queries";
import { getRecentChanges } from "@/lib/settings/audit";
import { getAllDiscoveredAccounts } from "@/lib/connectors/discovery-cache";
import { ClientForm } from "@/components/settings/client-form";
import { MappingsSection } from "@/components/settings/mappings-section";
import { updateClient } from "../../../actions";
import { PLATFORM_LABELS } from "@/lib/connectors/platform-labels";
import type { Platform } from "@/lib/connectors/types";

export const dynamic = "force-dynamic";

function formatChangeValue(value: string | null): string {
  if (value === null || value === "") return "nothing";
  if (value === "true") return "on";
  if (value === "false") return "off";
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

// The audit log stores database field names; this turns each entry into a
// sentence someone non-technical can read.
function describeChange(change: {
  platform: Platform | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}): string {
  const platform = change.platform ? PLATFORM_LABELS[change.platform] : null;
  if (change.field === "credential_label") {
    return `changed which ${platform ?? ""} access key is used`.replace("  ", " ");
  }
  if (change.field === "active") {
    const target = platform ? `${platform} updates` : "this client";
    return `turned ${target} ${formatChangeValue(change.newValue)}`;
  }
  const what =
    change.field === "external_id"
      ? `the ${platform ?? ""} account`.replace("  ", " ")
      : change.field === "name"
        ? "the name"
        : change.field === "timezone"
          ? "the timezone"
          : change.field.replace(/_/g, " ");
  if (change.oldValue === null) return `set ${what} to ${formatChangeValue(change.newValue)}`;
  return `changed ${what} from ${formatChangeValue(change.oldValue)} to ${formatChangeValue(change.newValue)}`;
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
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/settings/clients" className="w-fit text-sm text-muted-foreground hover:text-foreground">
          ← All clients
        </Link>
        <h2 className="font-heading text-lg font-medium text-foreground">{client.name}</h2>
        <p className="text-sm text-muted-foreground">
          This client&apos;s details, and which of their accounts we pull numbers from.
        </p>
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
                <span className="text-foreground">{change.userEmail}</span> {describeChange(change)} —{" "}
                {change.changedAt.toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
