import { asc } from "drizzle-orm";
import { MailCheckIcon, MailWarningIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { reportRecipients } from "@/lib/db/schema";
import { EmailReportsManager } from "@/components/settings/email-reports-manager";
import { getEmailConfig } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
// "Send now" builds the daily summary (an AI call) before emailing it.
export const maxDuration = 60;

export default async function EmailReportsPage() {
  const db = await getDb();
  const recipients = await db.select().from(reportRecipients).orderBy(asc(reportRecipients.email));
  // Only whether it's set up, the sender address, and the names of any
  // missing settings — never the key.
  const { from, missing } = getEmailConfig();
  const configured = missing.length === 0;

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
            Email sending isn&apos;t switched on yet, so nothing will be sent. The app can&apos;t see{" "}
            {missing.map((name, i) => (
              <span key={name}>
                {i > 0 && " or "}
                <code className="text-xs">{name}</code>
              </span>
            ))}
            . If {missing.length === 1 ? "it was" : "they were"} just added in Vercel, make sure{" "}
            {missing.length === 1 ? "it's" : "they're"} set for <span className="font-medium">Production</span>, then
            redeploy — Vercel only applies new settings to a fresh deployment. You can still set up the list now.
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
