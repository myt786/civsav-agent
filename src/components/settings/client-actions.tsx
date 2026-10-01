"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toaster";
import { archiveClient, deactivateClient, reactivateClient, unarchiveClient } from "@/app/settings/actions";

// Pause / Resume / Archive / Restore for one client. Archiving always pauses
// too (archiveClient sets active = false), so an archived client is never
// pulled by the daily or monthly updates; Restore brings it back running.
export function ClientActions({
  clientId,
  clientName,
  active,
  archived,
}: {
  clientId: string;
  clientName: string;
  active: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function run(action: () => Promise<void>, message: string) {
    startTransition(async () => {
      try {
        await action();
        toast({ variant: "success", title: message });
        setConfirmOpen(false);
        router.refresh();
      } catch {
        toast({ variant: "error", title: "That didn't work — please try again." });
      }
    });
  }

  if (archived) {
    return (
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => run(() => unarchiveClient(clientId), `${clientName} restored`)}
      >
        <ArchiveRestoreIcon className="size-3.5" />
        {pending ? "Restoring…" : "Restore client"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {active ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => deactivateClient(clientId), `${clientName} paused`)}
        >
          <PauseIcon className="size-3.5" />
          Pause updates
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => reactivateClient(clientId), `${clientName} resumed`)}
        >
          <PlayIcon className="size-3.5" />
          Resume updates
        </Button>
      )}

      <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending}>
            <ArchiveIcon className="size-3.5" />
            Archive
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-80 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">Archive {clientName}?</p>
            <p className="text-xs text-muted-foreground">
              Updates stop, and the client is hidden from the dashboard, summaries and this list. Numbers
              collected so far are kept, and you can restore the client at any time.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => run(() => archiveClient(clientId), `${clientName} archived`)}
            >
              {pending ? "Archiving…" : "Archive client"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
