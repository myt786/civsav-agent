"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db";
import { reportRecipients } from "@/lib/db/schema";
import { isUuid } from "@/lib/settings/validation";
import { sendDailyDigest } from "@/lib/insights/send-daily-digest";
import { getSeoDashboardData } from "@/lib/seo/queries";
import { buildDigestSummary } from "@/lib/seo/digest";
import { buildAccessReportEmail, buildSeoDigestEmail } from "@/lib/email/templates";
import { sendMonthlyAnalysisEmail } from "@/lib/analysis/email";
import { buildAccessReport } from "@/lib/settings/access-report";
import { emailReport } from "@/lib/email/reports";
import { getAppUrl } from "@/lib/app-url";

export interface RecipientFormState {
  error?: string;
  success?: string;
}

const addSchema = z.object({
  email: z.email("Enter a valid email address.").transform((value) => value.trim().toLowerCase()),
  dailySummary: z.boolean(),
  monthlySeo: z.boolean(),
  accessReport: z.boolean(),
  monthlyAnalysis: z.boolean(),
});

export async function addReportRecipient(_prev: RecipientFormState, formData: FormData): Promise<RecipientFormState> {
  const session = await requireSession();
  const parsed = addSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    dailySummary: formData.get("dailySummary") === "on",
    monthlySeo: formData.get("monthlySeo") === "on",
    accessReport: formData.get("accessReport") === "on",
    monthlyAnalysis: formData.get("monthlyAnalysis") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the email address." };
  if (!parsed.data.dailySummary && !parsed.data.monthlySeo && !parsed.data.accessReport && !parsed.data.monthlyAnalysis) {
    return { error: "Tick at least one report." };
  }

  const db = await getDb();
  const [existing] = await db
    .select({ id: reportRecipients.id })
    .from(reportRecipients)
    .where(eq(reportRecipients.email, parsed.data.email))
    .limit(1);
  if (existing) return { error: `${parsed.data.email} is already on the list.` };

  await db.insert(reportRecipients).values({ ...parsed.data, createdBy: session.email });
  revalidatePath("/settings/email-reports");
  return { success: `${parsed.data.email} added.` };
}

export async function updateReportRecipient(
  id: string,
  field: "dailySummary" | "monthlySeo" | "accessReport" | "monthlyAnalysis",
  value: boolean,
): Promise<void> {
  await requireSession();
  if (!isUuid(id) || !["dailySummary", "monthlySeo", "accessReport", "monthlyAnalysis"].includes(field)) return;
  const db = await getDb();
  const on = value === true;
  await db
    .update(reportRecipients)
    .set(
      field === "dailySummary"
        ? { dailySummary: on }
        : field === "monthlySeo"
          ? { monthlySeo: on }
          : field === "monthlyAnalysis"
            ? { monthlyAnalysis: on }
            : { accessReport: on },
    )
    .where(eq(reportRecipients.id, id));
  revalidatePath("/settings/email-reports");
}

export async function removeReportRecipient(id: string): Promise<void> {
  await requireSession();
  if (!isUuid(id)) return;
  const db = await getDb();
  await db.delete(reportRecipients).where(eq(reportRecipients.id, id));
  revalidatePath("/settings/email-reports");
}

export interface SendNowResult {
  sent: boolean;
  message: string;
}

// "Send now" buttons: the same emails the crons send, to the same people.
export async function sendReportNow(kind: "daily" | "monthlySeo" | "access" | "monthlyAnalysis"): Promise<SendNowResult> {
  await requireSession();
  if (kind === "daily") {
    const result = await sendDailyDigest(new Date(), { slack: false, email: true });
    return result.email.sent
      ? { sent: true, message: "Daily summary emailed." }
      : { sent: false, message: result.email.reason ?? "Couldn't send the email." };
  }
  if (kind === "monthlySeo") {
    const summary = buildDigestSummary(await getSeoDashboardData());
    const result = await emailReport("monthlySeo", buildSeoDigestEmail(summary, getAppUrl()));
    return result.sent
      ? { sent: true, message: "SEO monthly summary emailed." }
      : { sent: false, message: result.reason ?? "Couldn't send the email." };
  }
  if (kind === "access") {
    const result = await emailReport("access", buildAccessReportEmail(await buildAccessReport(), getAppUrl()));
    return result.sent
      ? { sent: true, message: "Account access report emailed." }
      : { sent: false, message: result.reason ?? "Couldn't send the email." };
  }
  if (kind === "monthlyAnalysis") {
    const result = await sendMonthlyAnalysisEmail();
    return result.sent
      ? { sent: true, message: "Monthly client analysis emailed." }
      : { sent: false, message: result.reason ?? "Couldn't send the email." };
  }
  return { sent: false, message: "Unknown report." };
}
