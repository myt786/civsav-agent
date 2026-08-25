"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runSyncNow, type SyncNowResult } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";

export function SyncNowButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncNowResult | null>(null);
  const router = useRouter();

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const outcome = await runSyncNow();
      setResult(outcome);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={handleClick}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {result && !pending && (
        <span
          className={
            result.status === "failed"
              ? "text-xs text-destructive"
              : result.errorCount > 0
                ? "text-xs text-amber-700 dark:text-amber-500"
                : "text-xs text-muted-foreground"
          }
        >
          {result.status === "failed"
            ? `Failed — 0/${result.attempted} succeeded`
            : result.errorCount > 0
              ? `Done — ${result.attempted - result.errorCount}/${result.attempted} succeeded`
              : `Done — ${result.attempted} synced`}
        </span>
      )}
    </div>
  );
}
