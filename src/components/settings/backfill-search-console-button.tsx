"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HistoryIcon } from "lucide-react";
import { backfillSearchConsoleDay, finishBackfill } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

const DAYS = 30;

// Re-fetches Search Console for each of the last DAYS days, one day per
// request (oldest first), so no single request runs into the 300s limit.
// Only Search Console is touched — other platforms and metered Ahrefs are
// left alone.
export function BackfillSearchConsoleButton() {
  const [progress, setProgress] = useState<number | null>(null);
  const router = useRouter();

  async function run() {
    if (
      !window.confirm(
        `Fill in the last ${DAYS} days of Search Console numbers for every client? It takes a few minutes — keep this page open until it finishes.`,
      )
    ) {
      return;
    }

    let daysWithProblems = 0;
    let failedRequests = 0;
    for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
      setProgress(DAYS - daysAgo + 1);
      try {
        const result = await backfillSearchConsoleDay(daysAgo);
        if (result.errorCount > 0) daysWithProblems++;
      } catch {
        failedRequests++;
      }
    }
    await finishBackfill();
    setProgress(null);
    router.refresh();

    if (failedRequests > 0) {
      toast({
        variant: "error",
        title: "Search Console partly filled in",
        description: `${failedRequests} of ${DAYS} days couldn't be fetched. Click again to retry — days already filled are just refreshed.`,
      });
    } else if (daysWithProblems > 0) {
      toast({
        variant: "default",
        title: "Search Console filled in",
        description:
          "Some clients couldn't be read — usually because we don't have access to their Search Console yet. The Insights page lists them.",
      });
    } else {
      toast({ variant: "success", title: "Search Console filled in", description: `The last ${DAYS} days are up to date.` });
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={progress !== null} onClick={run}>
      <HistoryIcon className="size-3.5" aria-hidden />
      {progress !== null ? `Filling day ${progress} of ${DAYS}…` : "Fill in missing Search Console days"}
    </Button>
  );
}
