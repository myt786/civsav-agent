"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Keeps a failure on one client's page inside Settings, with a way back
// and a retry, instead of the browser-wide "Application error" screen.
export default function ClientPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex w-full flex-col gap-6">
      <Link
        href="/settings/clients"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        All clients
      </Link>
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-card p-5 shadow-sm">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-medium text-foreground">This client&apos;s page couldn&apos;t load</h2>
          <p className="text-sm text-muted-foreground">
            Something went wrong while loading it. Try again, or go back to the client list — you can still edit
            this client&apos;s accounts from the Accounts button there.
          </p>
          {error.digest && <p className="font-mono text-xs text-muted-foreground">Error code: {error.digest}</p>}
          <div>
            <Button size="sm" onClick={() => reset()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
