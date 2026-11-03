import Link from "next/link";
import { listLeadReports, listLeadReportSchedules } from "@/lib/lead-report/queries";
import { LeadReportSchedules, NewLeadReportForm } from "@/components/lead-reports/lead-report-controls";
import { STATUS_INFO } from "@/lib/lead-report/status";
import { TONE_INFO } from "@/lib/lead-report/tone";
import type { LeadReportListEntry } from "@/lib/lead-report/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KIND_LABEL = { weekly: "Weekly", monthly: "Monthly", on_demand: "On demand" } as const;

function ReportList({ title, empty, reports }: { title: string; empty: string; reports: LeadReportListEntry[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">
        {title} <span className="text-muted-foreground">· {reports.length}</span>
      </h3>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/settings/lead-reports/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-40 font-medium text-foreground">{r.clientName}</span>
                <span className="text-sm text-muted-foreground">
                  {KIND_LABEL[r.kind]} · {r.periodStart} → {r.periodEnd}
                </span>
                <span className="text-sm text-foreground">
                  <strong>{r.counts.tier1}</strong> call today · {r.counts.tier2} this week · {r.counts.open} open
                </span>
                <span className="text-xs text-muted-foreground">{TONE_INFO[r.tone].label} tone</span>
                {r.remarks > 0 && <span className="text-xs text-muted-foreground">{r.remarks} remark{r.remarks === 1 ? "" : "s"}</span>}
                <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_INFO[r.status].className)}>
                  {STATUS_INFO[r.status].label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function LeadReportsPage() {
  const [reports, schedules] = await Promise.all([listLeadReports(), listLeadReportSchedules()]);
  const toReview = reports.filter((r) => r.status === "in_review" || r.status === "changes_requested");
  const approved = reports.filter((r) => r.status === "approved");
  const sent = reports.filter((r) => r.status === "sent").slice(0, 30);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 className="font-heading text-lg font-medium text-foreground">Lead reports</h2>
        <p className="text-sm text-muted-foreground">
          An AI sales call priority list per client: every lead from website forms, GoHighLevel and the phone line, de-duplicated,
          scored and ranked into who to call today, this week, and who to nurture. The team reviews each one, adds remarks and
          approves it, then sends it to the client as a PDF.
        </p>
      </div>
      <NewLeadReportForm clients={schedules.map((s) => ({ id: s.clientId, name: s.clientName, tone: s.tone, hasLeadSource: s.hasLeadSource }))} />
      <ReportList title="Waiting for review" empty="Nothing to review." reports={toReview} />
      <ReportList title="Approved — ready to send" empty="No approved reports waiting to be sent." reports={approved} />
      <ReportList title="Sent" empty="No reports sent yet." reports={sent} />
      <LeadReportSchedules rows={schedules} />
    </div>
  );
}
