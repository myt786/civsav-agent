"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { runSyncNow } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

export function SyncNowButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const outcome = await runSyncNow();
      router.refresh();

      if (outcome.status === "failed") {
        toast({ variant: "error", title: "Sync failed", description: `0/${outcome.attempted} succeeded` });
      } else if (outcome.errorCount > 0) {
        toast({
          variant: "error",
          title: "Sync completed with errors",
          description: `${outcome.attempted - outcome.errorCount}/${outcome.attempted} succeeded`,
        });
      } else {
        toast({ variant: "success", title: "Sync complete", description: `${outcome.attempted} platform mappings synced` });
      }
    });
  }

  return (
    <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={handleClick}>
      {pending ? "Syncing…" : "Sync now"}
    </Button>
  );
}
