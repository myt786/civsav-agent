"use client";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <div className="workspace">
      <div className="panel px-6 py-16 text-center">
        <h1 className="section-title">We couldn’t load this workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The data source may be temporarily unavailable. Try loading it again.
        </p>
        <Button onClick={reset} variant="outline" className="mt-5">
          Try again
        </Button>
      </div>
    </div>
  );
}
