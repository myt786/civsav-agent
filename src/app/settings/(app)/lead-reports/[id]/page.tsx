import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { getLeadReport } from "@/lib/lead-report/queries";
import { isUuid } from "@/lib/settings/validation";
import { LeadReportReview } from "@/components/lead-reports/lead-report-review";
import { TONE_INFO } from "@/lib/lead-report/tone";
import type { ScoredLead } from "@/lib/lead-report/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TIERS = [
  { key: 1, label: "Tier 1 · Call today", note: "tier1", color: "bg-teal-600" },
  { key: 2, label: "Tier 2 · Call this week", note: "tier2", color: "bg-blue-600" },
  { key: 3, label: "Tier 3 · Nurture", note: "tier3", color: "bg-slate-500" },
  { key: "booked", label: "Already booked · Confirm, don't re-prospect", note: "booked", color: "bg-violet-600" },
] as const;

const CHANNEL = { website: "Website", crm: "CRM", phone: "Phone" } as const;

function LeadTable({ leads, booked }: { leads: ScoredLead[]; booked: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Lead</th>
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 font-medium">Business</th>
            <th className="px-3 py-2 font-medium">Context</th>
            {!booked && <th className="px-3 py-2 font-medium">What to say</th>}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.key} className="border-t border-border align-top">
              <td className="px-3 py-2">
                <div className="font-semibold text-foreground">{l.rank}</div>
                <div className="text-[11px] text-muted-foreground" title="Score out of 100">
                  {l.score}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{l.name ?? "Unknown caller"}</div>
                <div className="text-xs text-muted-foreground">
                  {l.channels.map((c) => CHANNEL[c]).join(" + ")} · {l.firstAt.slice(0, 10)}
                  {l.calls > 0 && ` · ${l.calls} call${l.calls === 1 ? "" : "s"}${l.missedCalls ? ` (${l.missedCalls} missed)` : ""}`}
                </div>
              </td>
              <td className="px-3 py-2">
                {l.phone && <div className="text-foreground">{l.phone}</div>}
                {l.email && <div className="text-xs text-muted-foreground">{l.email}</div>}
              </td>
              <td className="px-3 py-2 text-foreground">{l.company ?? ""}</td>
              <td className="px-3 py-2 text-foreground">{l.assessment.context}</td>
              {!booked && <td className="px-3 py-2 text-foreground">{l.assessment.opener}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LeadReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const row = await getLeadReport(id);
  if (!row) notFound();
  const db = await getDb();
  const [client] = await db.select({ emails: clients.leadReportEmails }).from(clients).where(eq(clients.id, row.clientId)).limit(1);
  const { report } = row;

  return (
    <div className="flex w-full flex-col gap-6">
      <Link href="/settings/lead-reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> All lead reports
      </Link>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          {row.clientName} · Sales call priority list
        </h2>
        <p className="text-sm text-muted-foreground">
          {report.period.label} · {TONE_INFO[row.tone].label} tone{report.toneNote ? ` (“${report.toneNote}”)` : ""} · written by AI ({report.model})
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Call today", value: report.counts.tier1, color: "text-teal-600" },
              { label: "Call this week", value: report.counts.tier2, color: "text-blue-600" },
              { label: "Nurture", value: report.counts.tier3, color: "text-slate-500" },
              { label: "Already booked", value: report.counts.booked, color: "text-violet-600" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className={cn("text-3xl font-semibold", s.color)}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="text-base font-semibold text-foreground">{report.summary.headline}</h3>
            <p className="text-sm text-foreground">{report.summary.intro}</p>
            {report.summary.takeaways.length > 0 && (
              <ul className="ml-4 list-disc text-sm text-foreground">
                {report.summary.takeaways.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {report.counts.total} people · {report.counts.duplicatesMerged} duplicates merged · {report.counts.junk} spam left out
              {report.byChannel.length > 0 && ` · ${report.byChannel.map((c) => `${c.label} ${c.count}`).join(", ")}`}
            </p>
            {report.missingChannels.length > 0 && (
              <p className="text-xs text-muted-foreground">Not included: {report.missingChannels.join("; ")}.</p>
            )}
          </section>

          {TIERS.map((tier) => {
            const leads = report.leads.filter((l) => l.tier === tier.key);
            if (leads.length === 0) return null;
            return (
              <section key={tier.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full", tier.color)} />
                  <h3 className="text-sm font-semibold text-foreground">
                    {tier.label} <span className="font-normal text-muted-foreground">· {leads.length}</span>
                  </h3>
                </div>
                {report.summary.tierNotes[tier.note] && <p className="text-sm text-muted-foreground">{report.summary.tierNotes[tier.note]}</p>}
                <LeadTable leads={leads} booked={tier.key === "booked"} />
              </section>
            );
          })}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <LeadReportReview
            id={row.id}
            clientId={row.clientId}
            status={row.status}
            tone={row.tone}
            toneNote={report.toneNote}
            headline={report.summary.headline}
            intro={report.summary.intro}
            events={row.events}
            clientEmails={client?.emails ?? []}
            sentTo={row.sentTo}
          />
        </aside>
      </div>
    </div>
  );
}
