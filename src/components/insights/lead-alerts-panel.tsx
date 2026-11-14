"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOffIcon, BellRingIcon, CheckCircle2Icon, CheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { acknowledgeLeadAlert, resolveLeadAlert, snoozeLeadAlert } from "@/app/settings/lead-alert-actions";
import { LEAD_ALERT_CHECKS, LEAD_ALERT_TITLE } from "@/lib/lead-alerts/labels";
import type { LeadAlertRow } from "@/lib/lead-alerts/queries";
import { cn } from "@/lib/utils";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function AlertCard({ alert }: { alert: LeadAlertRow }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const critical = alert.severity === "critical";

  function act(kind: "ack" | "resolve" | 1 | 7 | 90) {
    startTransition(async () => {
      const result =
        kind === "ack"
          ? await acknowledgeLeadAlert(alert.id, note)
          : kind === "resolve"
            ? await resolveLeadAlert(alert.id, note)
            : await snoozeLeadAlert(alert.id, kind);
      if (result.error) toast({ variant: "error", title: "Not saved", description: result.error });
      else {
        toast({ variant: "success", title: kind === "ack" ? "Acknowledged" : kind === "resolve" ? "Marked resolved" : "Snoozed" });
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm",
        alert.status === "acknowledged" || alert.snoozedUntil ? "border-border opacity-80" : critical ? "border-destructive/40" : "border-warning/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            critical ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning",
          )}
        >
          {LEAD_ALERT_TITLE[alert.kind]}
        </span>
        <Link href={`/settings/clients/${alert.clientId}`} className="font-medium text-foreground hover:underline">
          {alert.clientName}
        </Link>
        <span className="text-xs text-muted-foreground">since {when(alert.openedAt)}</span>
        {alert.owner && <span className="text-xs text-muted-foreground">· owner {alert.owner}</span>}
      </div>
      <p className="text-sm text-foreground">{alert.message}</p>
      {alert.detail.lastLeadDate && <p className="text-xs text-muted-foreground">Last lead: {alert.detail.lastLeadDate}</p>}
      <p className="text-xs text-muted-foreground">{LEAD_ALERT_CHECKS[alert.kind]}</p>
      {alert.snoozedUntil && (
        <p className="text-xs text-muted-foreground">
          <BellOffIcon className="mr-1 inline size-3.5" />
          Snoozed {new Date(alert.snoozedUntil).getTime() - Date.now() > 30 * 86_400_000 ? "until leads are back" : `until ${when(alert.snoozedUntil)}`}
        </p>
      )}
      {alert.status === "acknowledged" && (
        <p className="text-xs text-foreground">
          <CheckIcon className="mr-1 inline size-3.5 text-success" />
          {alert.acknowledgedBy} is on it{alert.acknowledgedAt ? ` (${when(alert.acknowledgedAt)})` : ""}
          {alert.note ? ` — “${alert.note}”` : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={alert.status === "acknowledged" ? "Update the note" : "What's being done (optional)"}
          className="h-8 min-w-48 flex-1"
          maxLength={1000}
        />
        <Button size="sm" disabled={pending} onClick={() => act("ack")}>
          {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          {alert.status === "acknowledged" ? "Update" : "Acknowledge"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act("resolve")}>
          Resolve
        </Button>
        <select
          aria-label="Snooze"
          disabled={pending}
          value=""
          onChange={(e) => e.target.value && act(Number(e.target.value) as 1 | 7 | 90)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-muted-foreground shadow-xs"
        >
          <option value="">Snooze…</option>
          <option value="1">1 day</option>
          <option value="7">1 week</option>
          <option value="90">Until leads are back</option>
        </select>
      </div>
    </li>
  );
}

// Insights: lead alerts that are open (red/amber, waiting for someone),
// acknowledged (someone's on it), and those resolved in the last week.
export function LeadAlertsPanel({ alerts }: { alerts: LeadAlertRow[] }) {
  const active = alerts.filter((a) => a.status !== "resolved");
  const resolved = alerts.filter((a) => a.status === "resolved");
  const [showResolved, setShowResolved] = useState(false);
  const open = active.filter((a) => a.status === "open").length;

  return (
    <section id="lead-alerts" className="flex scroll-mt-6 flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <BellRingIcon className="size-3.5" /> Lead alerts
        {open > 0 && <span className="rounded-full bg-destructive/10 px-1.5 text-[10px] text-destructive">{open} open</span>}
      </h2>
      {active.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          <CheckCircle2Icon className="size-4 text-success" /> Every client&apos;s leads look normal.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {active.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => setShowResolved((v) => !v)} className="self-start text-xs text-primary hover:underline">
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved in the last week
          </button>
          {showResolved && (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card text-sm shadow-sm">
              {resolved.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-x-2 px-3 py-2">
                  <span className="font-medium text-foreground">{a.clientName}</span>
                  <span className="text-muted-foreground">{LEAD_ALERT_TITLE[a.kind]}</span>
                  <span className="text-muted-foreground">
                    · {when(a.openedAt)} → {a.resolvedAt ? when(a.resolvedAt) : ""} ({a.resolvedBy})
                  </span>
                  {a.note && <span className="text-muted-foreground">· “{a.note}”</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
