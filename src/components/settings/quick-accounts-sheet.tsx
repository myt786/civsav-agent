"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon } from "lucide-react";
import { getQuickAccountsData, type QuickAccountsData } from "@/app/settings/actions";
import { MappingsSection } from "@/components/settings/mappings-section";
import type { MappingRowData } from "@/components/settings/mapping-row";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { Platform } from "@/lib/connectors/types";

// Edit one client's accounts from the clients list, without opening the
// client page: the same account rows (connect, re-check, access links),
// in a side panel. The list refreshes when it closes so its chips update.
export function QuickAccountsSheet({
  client,
  onClose,
}: {
  client: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<{ clientId: string; value: QuickAccountsData | null } | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    getQuickAccountsData(client.id).then((value) => {
      if (!cancelled) setData({ clientId: client.id, value });
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  // After a save or check, refetch so each row compares against what's
  // now saved (otherwise "Save" stays showing).
  function reload() {
    if (!client) return;
    const id = client.id;
    getQuickAccountsData(id).then((value) => setData((prev) => (prev?.clientId === id ? { clientId: id, value } : prev)));
  }

  const loaded = client && data?.clientId === client.id ? data.value : undefined;
  const mappingByPlatform = new Map<Platform, MappingRowData>(
    (loaded?.mappings ?? []).map((m) => [m.platform, m]),
  );

  return (
    <Sheet
      open={client !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          router.refresh();
        }
      }}
    >
      {/* The sheet's own default caps a right panel at max-w-sm through a
          data-[side=right] variant, which a plain sm:max-w-* can't
          override — so the width is set with the same variant. Wide enough
          for the account rows' three columns. */}
      <SheetContent
        side="right"
        className="gap-0 overflow-hidden data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:sm:w-[min(68rem,94vw)] data-[side=right]:sm:max-w-none"
      >
        {/* Header stays put; only the body below scrolls. Scrolling the
            dialog panel itself didn't work reliably under the modal's
            scroll lock. */}
        <SheetHeader className="shrink-0 border-b border-border">
          <SheetTitle>{client?.name ?? ""}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-3">
            Connect or change this client&apos;s accounts.
            {client && (
              <Link
                href={`/settings/clients/${client.id}`}
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                Open full page
                <ArrowUpRightIcon className="size-3.5" aria-hidden />
              </Link>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
          {loaded === undefined ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : loaded === null ? (
            <p className="text-sm text-muted-foreground">This client couldn&apos;t be loaded. Please reload the page.</p>
          ) : (
            client && (
              <MappingsSection
                key={client.id}
                clientId={client.id}
                clientName={client.name}
                initialDiscovery={loaded.discovery}
                mappingByPlatform={mappingByPlatform}
                accessInfo={loaded.accessInfo}
                excludedPlatforms={loaded.excludedPlatforms}
                onChanged={reload}
              />
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
