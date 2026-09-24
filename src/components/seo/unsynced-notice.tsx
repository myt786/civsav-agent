"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InfoIcon, XIcon } from "lucide-react";

const STORAGE_KEY = "seo-unsynced-notice-dismissed";

// One compact line instead of a full-width amber paragraph: the "why" lives
// on /insights (grouped by the actual failure), so this only needs to say
// how many and point there. Dismissal is remembered per browser against the
// count, so it reappears if more clients stop syncing.
export function UnsyncedNotice({ count }: { count: number }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === String(count));
    } catch {
      // Storage unavailable (private mode, blocked) — just show the notice.
    }
  }, [count]);

  if (count === 0 || dismissed) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
      <InfoIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-foreground">
          {count} client{count === 1 ? " hasn’t" : "s haven’t"} synced yet
        </span>{" "}
        — usually Search Console access still needs granting.{" "}
        <Link href="/insights" className="text-primary hover:underline">
          See what&apos;s missing
        </Link>
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(STORAGE_KEY, String(count));
          } catch {
            // Non-persistent dismissal is fine.
          }
        }}
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
