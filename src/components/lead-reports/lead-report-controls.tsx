"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { saveLeadReportSettings } from "@/app/settings/lead-report-actions";
import { TONE_INFO } from "@/lib/lead-report/tone";
import { LEAD_TONES, type LeadTone } from "@/lib/lead-report/types";

export const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function ToneSelect({ value, onChange, id }: { value: LeadTone; onChange: (tone: LeadTone) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as LeadTone)} className={SELECT_CLASS} aria-label="Tone">
      {LEAD_TONES.map((t) => (
        <option key={t} value={t}>
          {TONE_INFO[t].label} — {TONE_INFO[t].hint}
        </option>
      ))}
    </select>
  );
}

export async function requestLeadReport(body: {
  clientId: string;
  days?: number;
  tone?: LeadTone;
  toneNote?: string;
  replaceId?: string;
}): Promise<{ id?: string; error?: string }> {
  try {
    const response = await fetch("/api/lead-reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!response.ok) return { error: json.error ?? "Couldn't make the report." };
    return { id: json.id };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }
}

// "Make a report now": any client, any recent period, any tone.
export function NewLeadReportForm({ clients }: { clients: { id: string; name: string; tone: string; hasLeadSource: boolean }[] }) {
  const router = useRouter();
  const withSource = clients.filter((c) => c.hasLeadSource);
  const [clientId, setClientId] = useState(withSource[0]?.id ?? "");
  const [days, setDays] = useState(30);
  const [tone, setTone] = useState<LeadTone>("positive");
  const [busy, setBusy] = useState(false);

  async function make() {
    if (!clientId) return;
    setBusy(true);
    const result = await requestLeadReport({ clientId, days, tone });
    setBusy(false);
    if (result.error || !result.id) {
      toast({ variant: "error", title: "Report not made", description: result.error });
      return;
    }
    toast({ variant: "success", title: "Report ready for review" });
    router.push(`/settings/lead-reports/${result.id}`);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-foreground">Make a report now</h3>
        <p className="text-xs text-muted-foreground">
          Reads every lead stored for the period, scores and ranks them, and puts the report in the review queue. Takes up to a
          couple of minutes for a busy client.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            const picked = clients.find((c) => c.id === e.target.value);
            if (picked && (LEAD_TONES as readonly string[]).includes(picked.tone)) setTone(picked.tone as LeadTone);
          }}
          className={SELECT_CLASS}
          aria-label="Client"
        >
          {withSource.length === 0 && <option value="">No client has a lead source connected</option>}
          {withSource.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={SELECT_CLASS} aria-label="Period">
          {[7, 14, 30, 60, 90, 180].map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
        <ToneSelect value={tone} onChange={setTone} />
        <Button onClick={make} disabled={busy || !clientId}>
          {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          {busy ? "Analysing leads…" : "Make report"}
        </Button>
      </div>
    </section>
  );
}

export interface ScheduleRow {
  clientId: string;
  clientName: string;
  cadence: string;
  tone: string;
  toneNote: string | null;
  emails: string[];
  hasLeadSource: boolean;
}

function ScheduleEditor({ row }: { row: ScheduleRow }) {
  const [cadence, setCadence] = useState(row.cadence);
  const [tone, setTone] = useState<LeadTone>((LEAD_TONES as readonly string[]).includes(row.tone) ? (row.tone as LeadTone) : "positive");
  const [toneNote, setToneNote] = useState(row.toneNote ?? "");
  const [emails, setEmails] = useState(row.emails.join(", "));
  const [pending, startTransition] = useTransition();
  const dirty =
    cadence !== row.cadence || tone !== row.tone || toneNote !== (row.toneNote ?? "") || emails !== row.emails.join(", ");

  function save() {
    startTransition(async () => {
      const result = await saveLeadReportSettings({ clientId: row.clientId, cadence, tone, toneNote, emails });
      if (result.error) toast({ variant: "error", title: "Not saved", description: result.error });
      else toast({ variant: "success", title: `${row.clientName} saved` });
    });
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3 text-sm font-medium text-foreground">
        {row.clientName}
        {!row.hasLeadSource && <div className="text-[11px] font-normal text-muted-foreground">No lead source connected</div>}
      </td>
      <td className="py-2 pr-3">
        <select value={cadence} onChange={(e) => setCadence(e.target.value)} className={SELECT_CLASS} aria-label={`${row.clientName} schedule`}>
          <option value="off">Off</option>
          <option value="weekly">Weekly (Mondays)</option>
          <option value="monthly">Monthly (the 1st)</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <ToneSelect value={tone} onChange={setTone} />
      </td>
      <td className="py-2 pr-3">
        <Input value={toneNote} onChange={(e) => setToneNote(e.target.value)} placeholder="e.g. say “opportunity”, never “problem”" maxLength={400} />
      </td>
      <td className="py-2 pr-3">
        <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="sales@client.com, owner@client.com" />
      </td>
      <td className="py-2">
        <Button size="sm" variant={dirty ? "default" : "outline"} onClick={save} disabled={pending || !dirty}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Save
        </Button>
      </td>
    </tr>
  );
}

export function LeadReportSchedules({ rows }: { rows: ScheduleRow[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-foreground">Schedule, tone and client emails</h3>
        <p className="text-xs text-muted-foreground">
          Scheduled reports are made the morning after the week or month closes and emailed to the team for review (the people
          ticked for the AI client analysis in Email reports). Nothing reaches a client until someone approves it and presses
          Send.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Client</th>
              <th className="pb-2 pr-3 font-medium">Schedule</th>
              <th className="pb-2 pr-3 font-medium">Tone</th>
              <th className="pb-2 pr-3 font-medium">Words to use or avoid</th>
              <th className="pb-2 pr-3 font-medium">Client emails for the PDF</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ScheduleEditor key={row.clientId} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
