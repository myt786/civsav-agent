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
        toast({ variant: "error", title: "Couldn't update any data", description: "Every platform failed. Check the red dots above for details." });
      } else if (outcome.errorCount > 0) {
        toast({
          variant: "error",
          title: "Updated, with some problems",
          description: `${outcome.attempted - outcome.errorCount} of ${outcome.attempted} updated. The rest are marked in red.`,
        });
      } else {
        toast({ variant: "success", title: "Data updated", description: `All ${outcome.attempted} connected accounts are up to date.` });
      }
    });
  }

  return (
    <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={handleClick}>
      {pending ? "Updating… (can take a few minutes)" : "Update data now"}
    </Button>
  );
}
