import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { reportRecipients } from "../db/schema";
import { sendEmail, type EmailMessage, type EmailSendResult } from "./resend";

export type ReportKind = "daily" | "monthlySeo" | "access" | "monthlyAnalysis";

export async function getReportRecipients(kind: ReportKind): Promise<string[]> {
  const db = await getDb();
  const column =
    kind === "daily"
      ? reportRecipients.dailySummary
      : kind === "monthlySeo"
        ? reportRecipients.monthlySeo
        : kind === "monthlyAnalysis"
          ? reportRecipients.monthlyAnalysis
          : reportRecipients.accessReport;
  const rows = await db
    .select({ email: reportRecipients.email })
    .from(reportRecipients)
    .where(eq(column, true))
    .orderBy(asc(reportRecipients.email));
  return rows.map((r) => r.email);
}

// Never throws: a broken email setup must not stop the Slack post (or the
// cron) that runs alongside it. The reason comes back for the caller to
// report.
export async function emailReport(kind: ReportKind, message: Omit<EmailMessage, "to">): Promise<EmailSendResult> {
  try {
    const to = await getReportRecipients(kind);
    if (to.length === 0) return { sent: false, reason: "No one is set to receive this report" };
    return await sendEmail({ ...message, to });
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
