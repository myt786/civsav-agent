import "server-only";
import { emailReport } from "../email/reports";
import { buildLeadClientEmail, buildLeadReviewEmail, type LeadReviewEmailEntry } from "../email/templates";
import { sendEmailWithAttachments, type EmailSendResult } from "../email/resend";
import { getAppUrl } from "../app-url";
import { renderLeadReportPdf } from "./pdf";
import type { LeadReportRow } from "./types";

// New reports to review go to the team members ticked for the AI client
// analysis in Settings → Email reports (same people, same kind of review).
export async function emailLeadReportsForReview(entries: LeadReviewEmailEntry[]): Promise<EmailSendResult> {
  if (entries.length === 0) return { sent: false, reason: "Nothing to review" };
  return emailReport("monthlyAnalysis", buildLeadReviewEmail(entries, getAppUrl()));
}

export function leadReportFilename(row: Pick<LeadReportRow, "clientName" | "periodEnd">): string {
  const slug = row.clientName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Client";
  return `${slug}-Sales-Call-Priority-List-${row.periodEnd}.pdf`;
}

export async function emailLeadReportToClient(row: LeadReportRow, to: string[], message: string | null, replyTo?: string): Promise<EmailSendResult> {
  const pdf = renderLeadReportPdf(row.report, new Date());
  const { report } = row;
  const content = buildLeadClientEmail({
    clientName: row.clientName,
    periodLabel: report.period.label,
    headline: report.summary.headline,
    intro: report.summary.intro,
    tier1: report.counts.tier1,
    tier2: report.counts.tier2,
    open: report.counts.open,
    message,
  });
  return sendEmailWithAttachments({
    ...content,
    to,
    replyTo,
    attachments: [{ filename: leadReportFilename(row), content: pdf }],
  });
}

