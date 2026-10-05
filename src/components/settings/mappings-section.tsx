"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheckIcon } from "lucide-react";
import { MappingRow, type MappingRowData } from "@/components/settings/mapping-row";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { RefreshDiscoveryButton } from "@/components/settings/refresh-discovery-button";
import type { DiscoveryState } from "@/components/settings/account-combobox";
import { discoverAllAccounts, verifyAllMappings } from "@/app/settings/actions";
import type { DiscoveredAccounts } from "@/lib/connectors/discovery-cache";
import { PLATFORM_HELP, PLATFORM_LABELS, PLATFORM_ORDER } from "@/lib/connectors/platform-labels";
import { bestMatch } from "@/lib/settings/fuzzy-match";
import type { Platform } from "@/lib/connectors/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AccessInfo } from "@/lib/connectors/access-info";

function toDiscoveryState(entries: DiscoveredAccounts[]): Record<Platform, DiscoveryState> {
  return Object.fromEntries(
    entries.map(({ platform, result }) => [
      platform,
      result.status === "ok"
        ? { status: "ok" as const, accounts: result.accounts, warnings: result.warnings }
        : { status: "error" as const, error: result.error, accounts: [] },
    ]),
  ) as Record<Platform, DiscoveryState>;
}

export function MappingsSection({
  clientId,
  clientName,
  initialDiscovery,
  mappingByPlatform,
  accessInfo,
  excludedPlatforms = [],
  onChanged,
}: {
  clientId: string;
  clientName: string;
  initialDiscovery: DiscoveredAccounts[];
  mappingByPlatform: Map<Platform, MappingRowData>;
  accessInfo: AccessInfo;
  // Platforms marked "Not used" for this client.
  excludedPlatforms?: Platform[];
  onChanged?: () => void;
}) {
  const [discovery, setDiscovery] = useState<Record<Platform, DiscoveryState>>(() =>
    toDiscoveryState(initialDiscovery),
  );

  const [checking, startChecking] = useTransition();
  const router = useRouter();

  function checkAll() {
    startChecking(async () => {
      const results = await verifyAllMappings(clientId);
      router.refresh();
      onChanged?.();
      const failed = results.filter((r) => r.result.status === "error");
      if (failed.length === 0) {
        toast({ variant: "success", title: `All ${results.length} accounts are working` });
      } else {
        toast({
          variant: "error",
          title: `${failed.length} of ${results.length} accounts not working`,
          description: failed.map((r) => PLATFORM_LABELS[r.platform]).join(", "),
        });
      }
    });
  }

  async function refresh() {
    const results = await discoverAllAccounts(true);
    setDiscovery(toDiscoveryState(results));
  }

  return (
    <TooltipProvider>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">Connected accounts</h3>
          <div className="flex items-center gap-2">
            {mappingByPlatform.size > 0 && (
              <Button type="button" variant="outline" size="sm" disabled={checking} onClick={checkAll}>
                <CheckCheckIcon className="size-3.5" />
                {checking ? "Checking…" : "Check all"}
              </Button>
            )}
            <RefreshDiscoveryButton onRefresh={refresh} />
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
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
                accessInfo={accessInfo}
                excluded={excludedPlatforms.includes(platform)}
                onChanged={onChanged}
                addKeyHref={
                  platform === "ghl" || platform === "openphone"
                    ? `/settings/api-keys?platform=${platform}&clientId=${clientId}&name=${encodeURIComponent(clientName)}`
                    : undefined
                }
              />
            );
          })}
        </div>
      </section>
    </TooltipProvider>
  );
}
