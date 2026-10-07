import "server-only";
import { emailReport } from "../email/reports";
import { buildMonthlyAnalysisEmail } from "../email/templates";
import type { EmailSendResult } from "../email/resend";
import { getAppUrl } from "../app-url";
import { getLatestClientHealth } from "./queries";

// Every live client's latest analysis, weakest first, to the team members
// ticked for "Monthly client analysis" in Settings → Email reports.
export async function sendMonthlyAnalysisEmail(): Promise<EmailSendResult> {
  try {
    const entries = await getLatestClientHealth();
    return await emailReport("monthlyAnalysis", buildMonthlyAnalysisEmail(entries, getAppUrl()));
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
