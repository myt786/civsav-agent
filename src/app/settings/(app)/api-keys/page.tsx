import { asc, like } from "drizzle-orm";
import { clientPlatformAccounts, platformCredentials } from "@/lib/db/schema";
import { getClient } from "@/lib/settings/queries";
import { isUuid } from "@/lib/settings/validation";
import { credentialsDb, storedIdFromLabel } from "@/lib/connectors/stored-credentials";
import { AddApiKeyForm } from "@/components/settings/add-api-key-form";
import { ApiKeysList, type ApiKeyRow } from "@/components/settings/api-keys-list";
import { countUnsavedEnvKeys } from "@/lib/connectors/env-keys";
import { CircleAlertIcon, KeyRoundIcon, LinkIcon, MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function SummaryTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          tone === "good" && "bg-success/10 text-success",
          tone === "warn" && "bg-warning/10 text-warning",
          tone === "neutral" && "bg-primary/10 text-primary",
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-heading text-xl font-semibold text-foreground tabular-nums">{value}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

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
    isUuid(params.clientId) ? getClient(params.clientId) : Promise.resolve(null),
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
  const unsavedEnvKeys = await countUnsavedEnvKeys();
  const inUse = keys.filter((k) => k.usedBy > 0).length;
  const unused = keys.length - inUse;
  const missingLocation = keys.filter((k) => k.platform === "ghl" && !k.locationId).length;
  const ghlCount = keys.filter((k) => k.platform === "ghl").length;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 className="font-heading text-lg font-medium text-foreground">API keys</h2>
        <p className="text-sm text-muted-foreground">
          GoHighLevel and OpenPhone need their own key for each client, so they&apos;re added here. Every key is
          tested before it&apos;s saved and can&apos;t be viewed again afterwards.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Saved keys"
          value={keys.length}
          hint={`${ghlCount} GoHighLevel · ${keys.length - ghlCount} OpenPhone`}
          icon={<KeyRoundIcon className="size-4" />}
        />
        <SummaryTile
          label="In use"
          value={inUse}
          hint="Connected to at least one client"
          icon={<LinkIcon className="size-4" />}
          tone="good"
        />
        <SummaryTile
          label="Not used yet"
          value={unused}
          hint={unused > 0 ? "Connect them on a client's page" : "Every key is connected"}
          icon={<CircleAlertIcon className="size-4" />}
          tone={unused > 0 ? "warn" : "good"}
        />
        <SummaryTile
          label="Need a sub-account ID"
          value={missingLocation}
          hint={missingLocation > 0 ? "GoHighLevel keys can't work without one" : "All GoHighLevel keys are set"}
          icon={<MapPinIcon className="size-4" />}
          tone={missingLocation > 0 ? "warn" : "good"}
        />
      </div>

      {/* Add on the left, what's saved on the right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        {/* Stays in view while scrolling a long list of saved keys. */}
        <div className="lg:sticky lg:top-6">
          <AddApiKeyForm
            initialPlatform={initialPlatform}
            initialName={params.name ?? client?.name ?? ""}
            clientId={client?.id}
            clientName={client?.name}
          />
        </div>
        <ApiKeysList keys={keys} unsavedEnvKeys={unsavedEnvKeys} initialPlatform={initialPlatform} />
      </div>
    </div>
  );
}
