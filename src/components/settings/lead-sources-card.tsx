"use client";

import { useState, useTransition } from "react";
import { UsersIcon } from "lucide-react";
import { setLeadSourceCounted } from "@/app/settings/lead-source-actions";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { LEAD_SOURCES } from "@/lib/leads/sources";
import { cn } from "@/lib/utils";

// Client page: which lead sources add up to this client's total leads.
// Every connected source counts by default; switch one off when it
// double-counts another (e.g. Google Ads conversions that track the same
// form fills as the Lead Dashboard).
export function LeadSourcesCard({
  clientId,
  connectedPlatforms,
  off,
}: {
  clientId: string;
  connectedPlatforms: string[];
  off: string[];
}) {
  const [switchedOff, setSwitchedOff] = useState(new Set(off));
  const [pending, startTransition] = useTransition();
  const connected = LEAD_SOURCES.filter((s) => connectedPlatforms.includes(s.platform));
  const countedCount = connected.filter((s) => !switchedOff.has(s.key)).length;

  function toggle(key: string, on: boolean) {
    const previous = new Set(switchedOff);
    const next = new Set(switchedOff);
    if (on) next.delete(key);
    else next.add(key);
    setSwitchedOff(next);
    startTransition(async () => {
      const result = await setLeadSourceCounted(clientId, key, on);
      if (result.error) {
        setSwitchedOff(previous);
        toast({ variant: "error", title: "Not saved", description: result.error });
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <UsersIcon className="size-4" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium text-foreground">Lead sources</h3>
          <p className="text-xs text-muted-foreground">
            Total leads adds these together. Switch one off if it counts the same enquiries as another.
          </p>
        </div>
      </div>
      {connected.length === 0 ? (
        <p className="text-xs text-muted-foreground">No lead source is connected yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {connected.map((s) => {
            const on = !switchedOff.has(s.key);
            return (
              <li key={s.key} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className={cn("text-sm text-foreground", !on && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                    {s.label}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">{s.counts}</span>
                </div>
                <Switch
                  size="sm"
                  checked={on}
                  disabled={pending}
                  onCheckedChange={(value) => toggle(s.key, value)}
                  aria-label={`Count ${s.label} towards leads`}
                />
              </li>
            );
          })}
        </ul>
      )}
      {connected.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {countedCount === connected.length ? "All connected sources count." : `${countedCount} of ${connected.length} sources count.`}
        </p>
      )}
    </section>
  );
}
