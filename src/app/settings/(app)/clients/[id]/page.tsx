import { notFound } from "next/navigation";
import Link from "next/link";
import { param, type SearchParams } from "@/lib/dashboard/portfolio";
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

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  const search = await searchParams;
  const tab = ["connections", "activity"].includes(param(search, "tab"))
    ? param(search, "tab")
    : "profile";
  const [client, mappings, changes, discovery] = await Promise.all([
    getClient(id),
    getClientMappings(id),
    getRecentChanges(id),
    tab === "connections" ? getAllDiscoveredAccounts() : Promise.resolve([]),
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
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
      >
        <Link href="/settings/clients" className="hover:text-foreground">
          Client directory
        </Link>
        <span>/</span>
        <span>{client.name}</span>
        {client.active && (
          <Link href={`/clients/${id}`} className="quiet-link ml-auto">
            View performance ↗
          </Link>
        )}
      </nav>
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{client.name}</h2>
        <p className="text-sm text-muted-foreground">
          Manage this client’s profile and connected accounts.
        </p>
      </div>
      <nav
        aria-label="Client configuration"
        className="flex gap-7 border-b border-border"
      >
        {[
          ["profile", "Profile"],
          ["connections", "Connections"],
          ["activity", "Activity"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/settings/clients/${id}?tab=${key}`}
            className="nav-tab"
            aria-current={tab === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "profile" && (
        <section className="panel max-w-xl p-6">
          <h3 className="section-title mb-5">Client profile</h3>
          <ClientForm
            action={updateClient.bind(null, client.id)}
            defaultValues={{
              name: client.name,
              timezone: client.timezone,
              active: client.active,
            }}
            submitLabel="Save changes"
          />
        </section>
      )}

      {tab === "connections" && (
        <section id="connections" className="panel p-5">
          <MappingsSection
            clientId={client.id}
            clientName={client.name}
            initialDiscovery={discovery}
            mappingByPlatform={mappingByPlatform}
          />
        </section>
      )}

      {tab === "activity" && (
        <section className="panel flex flex-col gap-4 p-6">
          <h3 className="text-sm font-medium text-foreground">
            Recent changes
          </h3>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No changes recorded yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {changes.map((change) => (
                <li
                  key={change.id}
                  className="break-words py-4 leading-relaxed text-muted-foreground"
                >
                  <span className="text-foreground">{change.userEmail}</span>{" "}
                  changed{" "}
                  <span className="font-mono text-xs">
                    {change.platform ? `${change.platform}.` : ""}
                    {change.field}
                  </span>{" "}
                  from{" "}
                  <span className="font-mono text-xs">
                    {formatChangeValue(change.oldValue)}
                  </span>{" "}
                  to{" "}
                  <span className="font-mono text-xs">
                    {formatChangeValue(change.newValue)}
                  </span>{" "}
                  —{" "}
                  {change.changedAt.toLocaleString("en-US", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
