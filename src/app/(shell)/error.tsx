"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangleIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Keeps a failed page inside the shell — sidebar, search and Ask AI still
// work — with a retry, instead of the browser-wide "Application error"
// screen. Most failures here are the database briefly refusing connections,
// which a retry a moment later fixes.
export default function ShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-6 py-16">
      <div className="flex items-start gap-4 rounded-2xl border border-destructive/30 bg-card p-6 shadow-sm">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangleIcon className="size-5" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-lg font-semibold text-foreground">This page couldn&apos;t load</h1>
          <p className="text-sm text-muted-foreground">
            Something went wrong while fetching the data, usually a brief database hiccup. Try again in a moment —
            the rest of the dashboard still works from the sidebar.
          </p>
          {error.digest && <p className="font-mono text-xs text-muted-foreground">Error code: {error.digest}</p>}
          <div className="mt-1 flex gap-2">
            <Button size="sm" onClick={() => reset()}>
              <RotateCwIcon className="size-3.5" />
              Try again
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/settings/clients">Go to clients</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
