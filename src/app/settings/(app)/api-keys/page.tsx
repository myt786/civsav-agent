import { asc, like } from "drizzle-orm";
import { clientPlatformAccounts, platformCredentials } from "@/lib/db/schema";
import { getClient } from "@/lib/settings/queries";
import { credentialsDb, storedIdFromLabel } from "@/lib/connectors/stored-credentials";
import { AddApiKeyForm } from "@/components/settings/add-api-key-form";
import { ApiKeysList, type ApiKeyRow } from "@/components/settings/api-keys-list";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Names only — never values. Lists keys still configured the old way so
// it's clear what's in use while they're moved over.
function envKeyNames(): { ghl: string[]; openphone: string[] } {
  const keys = Object.keys(process.env).filter((key) => process.env[key]);
  return {
    ghl: keys.filter((key) => key.startsWith("GHL_AGENCY_API_KEY__")),
    openphone: keys.filter((key) => key === "OPENPHONE_API_KEY" || key.startsWith("OPENPHONE_API_KEY__")),
  };
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; clientId?: string; name?: string }>;
}) {
  const params = await searchParams;
  const db = await credentialsDb();

  const [rows, mappings, client] = await Promise.all([
    db
      .select({
        id: platformCredentials.id,
        platform: platformCredentials.platform,
        name: platformCredentials.name,
        externalId: platformCredentials.externalId,
        updatedAt: platformCredentials.updatedAt,
      })
      .from(platformCredentials)
      .orderBy(asc(platformCredentials.platform), asc(platformCredentials.name)),
    db
      .select({ credentialLabel: clientPlatformAccounts.credentialLabel })
      .from(clientPlatformAccounts)
      .where(like(clientPlatformAccounts.credentialLabel, "db:%")),
    params.clientId && UUID_RE.test(params.clientId) ? getClient(params.clientId) : Promise.resolve(null),
  ]);

  const usage = new Map<string, number>();
  for (const mapping of mappings) {
    const id = storedIdFromLabel(mapping.credentialLabel);
    if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
  }

  const keys: ApiKeyRow[] = rows
    .filter((row) => row.platform === "ghl" || row.platform === "openphone")
    .map((row) => ({
      id: row.id,
      platform: row.platform as "ghl" | "openphone",
      name: row.name,
      locationId: row.externalId,
      updatedAt: row.updatedAt.toISOString(),
      usedBy: usage.get(row.id) ?? 0,
    }));

  const initialPlatform = params.platform === "openphone" ? "openphone" : "ghl";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-medium text-foreground">API keys</h2>
        <p className="text-sm text-muted-foreground">
          An API key is like a password that lets this app read a client&apos;s numbers. GoHighLevel and OpenPhone
          need a separate key for each client, so paste each one here. We test it before saving and keep it
          locked away — no one can see it again after it&apos;s saved.
        </p>
      </div>

      <AddApiKeyForm
        initialPlatform={initialPlatform}
        initialName={params.name ?? client?.name ?? ""}
        clientId={client?.id}
        clientName={client?.name}
      />

      <ApiKeysList keys={keys} envKeyNames={envKeyNames()} />
    </div>
  );
}
