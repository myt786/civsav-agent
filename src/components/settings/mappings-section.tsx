"use client";

import { useState } from "react";
import { MappingRow, type MappingRowData } from "@/components/settings/mapping-row";
import { RefreshDiscoveryButton } from "@/components/settings/refresh-discovery-button";
import type { DiscoveryState } from "@/components/settings/account-combobox";
import { discoverAllAccounts } from "@/app/settings/actions";
import type { DiscoveredAccounts } from "@/lib/connectors/discovery-cache";
import { PLATFORM_HELP, PLATFORM_LABELS, PLATFORM_ORDER } from "@/lib/connectors/platform-labels";
import { bestMatch } from "@/lib/settings/fuzzy-match";
import type { Platform } from "@/lib/connectors/types";

function toDiscoveryState(entries: DiscoveredAccounts[]): Record<Platform, DiscoveryState> {
  return Object.fromEntries(
    entries.map(({ platform, result }) => [
      platform,
      result.status === "ok"
        ? { status: "ok" as const, accounts: result.accounts }
        : { status: "error" as const, error: result.error, accounts: [] },
    ]),
  ) as Record<Platform, DiscoveryState>;
}

export function MappingsSection({
  clientId,
  clientName,
  initialDiscovery,
  mappingByPlatform,
}: {
  clientId: string;
  clientName: string;
  initialDiscovery: DiscoveredAccounts[];
  mappingByPlatform: Map<Platform, MappingRowData>;
}) {
  const [discovery, setDiscovery] = useState<Record<Platform, DiscoveryState>>(() =>
    toDiscoveryState(initialDiscovery),
  );

  async function refresh() {
    const results = await discoverAllAccounts(true);
    setDiscovery(toDiscoveryState(results));
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">Platform mappings</h3>
        <RefreshDiscoveryButton onRefresh={refresh} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        {PLATFORM_ORDER.map((platform) => {
          const mapping = mappingByPlatform.get(platform) ?? null;
          const state = discovery[platform];
          // Only still-unmapped platforms get a suggestion — a saved
          // mapping already reflects a deliberate choice, so it isn't
          // second-guessed just because the client name changed later.
          const suggestion =
            !mapping && state.status !== "loading" && state.accounts.length > 0
              ? bestMatch(clientName, state.accounts)
              : null;
          return (
            <MappingRow
              key={platform}
              clientId={clientId}
              platform={platform}
              label={PLATFORM_LABELS[platform]}
              help={PLATFORM_HELP[platform]}
              mapping={mapping}
              discovery={state}
              suggestedId={suggestion?.account.id}
            />
          );
        })}
      </div>
    </section>
  );
}
