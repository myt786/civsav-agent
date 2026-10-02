import { asc } from "drizzle-orm";
import { MailCheckIcon, MailWarningIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { reportRecipients } from "@/lib/db/schema";
import { EmailReportsManager } from "@/components/settings/email-reports-manager";

export const dynamic = "force-dynamic";
// "Send now" builds the daily summary (an AI call) before emailing it.
export const maxDuration = 60;

export default async function EmailReportsPage() {
  const db = await getDb();
  const recipients = await db.select().from(reportRecipients).orderBy(asc(reportRecipients.email));
  // Only whether it's set up, and the sender address — never the key.
  const from = process.env.REPORTS_FROM_EMAIL ?? null;
  const configured = Boolean(process.env.RESEND_API_KEY && from);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 className="font-heading text-lg font-medium text-foreground">Email reports</h2>
        <p className="text-sm text-muted-foreground">
          Choose who gets the reports by email. The daily client summary goes out every morning (about 08:30 UTC),
          and the SEO summary on the 4th of each month — the same reports that are posted to Slack.
        </p>
      </div>

      {configured ? (
        <div className="flex max-w-3xl items-center gap-2.5 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm">
          <MailCheckIcon className="size-4 shrink-0 text-success" aria-hidden />
          <span>
            Email is set up. Reports are sent from <span className="font-medium">{from}</span>.
          </span>
        </div>
      ) : (
        <div className="flex max-w-3xl items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <MailWarningIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            Email sending isn&apos;t switched on yet, so nothing will be sent. Ask whoever manages the app to add the
            Resend settings (<code className="text-xs">RESEND_API_KEY</code> and{" "}
            <code className="text-xs">REPORTS_FROM_EMAIL</code>) in Vercel. You can still set up the list now.
          </span>
        </div>
      )}

      <EmailReportsManager
        configured={configured}
        recipients={recipients.map((r) => ({
          id: r.id,
          email: r.email,
          dailySummary: r.dailySummary,
          monthlySeo: r.monthlySeo,
        }))}
      />
    </div>
  );
}
