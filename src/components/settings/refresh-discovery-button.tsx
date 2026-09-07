"use client";

import { useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RefreshDiscoveryButton({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(onRefresh)}
    >
      <RefreshCwIcon className={cn("size-3.5", pending && "animate-spin")} />
      {pending ? "Refreshing…" : "Refresh accounts"}
    </Button>
  );
}
