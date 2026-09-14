"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateSeoMonthly, type SeoMonthlyFormState } from "@/app/seo/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";

const STATUS_OPTIONS = ["In Progress", "Done", "Blocked"] as const;

const initialState: SeoMonthlyFormState = {};

// Editorial fields (SEO Owner / Status / Notes) for the CURRENT month only
// — there's no carry-forward step to build here, unlike the Excel pipeline
// this replaces: next month's Prev. Month Summary is simply this month's
// `notes`, read directly by getSeoDashboardData.
export function SeoEditorialForm({
  clientId,
  month,
  seoOwner,
  status,
  notes,
  prevMonthSummary,
}: {
  clientId: string;
  month: string;
  seoOwner: string | null;
  status: string | null;
  notes: string | null;
  prevMonthSummary: string | null;
}) {
  const boundUpdate = updateSeoMonthly.bind(null, clientId, month);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);

  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      toast({ variant: "success", title: "Saved" });
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {prevMonthSummary && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Prev. month summary</p>
          <p className="mt-1 text-sm text-foreground/80 whitespace-pre-wrap">{prevMonthSummary}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`seoOwner-${clientId}`}>SEO Owner</Label>
        <Input id={`seoOwner-${clientId}`} name="seoOwner" defaultValue={seoOwner ?? ""} placeholder="Unassigned" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`status-${clientId}`}>Status</Label>
        <select
          id={`status-${clientId}`}
          name="status"
          defaultValue={status ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">—</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`notes-${clientId}`}>Notes / Action Items</Label>
        <textarea
          id={`notes-${clientId}`}
          name="notes"
          defaultValue={notes ?? ""}
          rows={4}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
