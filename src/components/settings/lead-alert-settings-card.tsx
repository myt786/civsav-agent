"use client";

import { useState, useTransition } from "react";
import { BellRingIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { saveLeadAlertSettings } from "@/app/settings/lead-alert-actions";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

// Client page: who gets this client's lead alerts, how easily they fire,
// and a pause for when leads are expected to stop (ads off, off season).
export function LeadAlertSettingsCard({
  clientId,
  owner,
  sensitivity,
  paused,
  team,
}: {
  clientId: string;
  owner: string | null;
  sensitivity: string;
  paused: boolean;
  team: string[];
}) {
  const [ownerValue, setOwner] = useState(owner ?? "");
  const [level, setLevel] = useState(sensitivity);
  const [isPaused, setPaused] = useState(paused);
  const [pending, startTransition] = useTransition();
  const dirty = ownerValue !== (owner ?? "") || level !== sensitivity || isPaused !== paused;

  function save() {
    startTransition(async () => {
      const result = await saveLeadAlertSettings({ clientId, owner: ownerValue, sensitivity: level, paused: isPaused });
      if (result.error) toast({ variant: "error", title: "Not saved", description: result.error });
      else toast({ variant: "success", title: "Lead alert settings saved" });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <BellRingIcon className="size-4" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium text-foreground">Lead alerts</h3>
          <p className="text-xs text-muted-foreground">
            Checked after the morning sync and again in the afternoon. Alerts go by email to the owner and to Slack.
          </p>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Owner
        <select value={ownerValue} onChange={(e) => setOwner(e.target.value)} className={SELECT}>
          <option value="">No owner — the daily summary list</option>
          {team.map((email) => (
            <option key={email} value={email}>
              {email}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Sensitivity
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={SELECT}>
          <option value="low">Low — only clear stoppages</option>
          <option value="normal">Normal</option>
          <option value="high">High — alert early</option>
        </select>
      </label>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm text-foreground">Pause alerts</span>
          <span className="text-[11px] text-muted-foreground">While ads are off or leads are expected to stop.</span>
        </div>
        <Switch size="sm" checked={isPaused} onCheckedChange={setPaused} aria-label="Pause lead alerts" />
      </div>
      <Button size="sm" className="self-start" variant={dirty ? "default" : "outline"} disabled={pending || !dirty} onClick={save}>
        {pending && <Loader2Icon className="animate-spin" />}
        Save
      </Button>
    </section>
  );
}
