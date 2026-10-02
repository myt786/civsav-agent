import { asc } from "drizzle-orm";
import { MailCheckIcon, MailWarningIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { reportRecipients } from "@/lib/db/schema";
import { EmailReportsManager } from "@/components/settings/email-reports-manager";
import { getEmailConfig } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
// "Send now" builds the daily summary (an AI call) before emailing it.
export const maxDuration = 60;

// Mirrors the cron schedules in vercel.json (all UTC).
function nextRun(now: Date, kind: "daily" | "monthlySeo" | "access"): Date {
  const at = new Date(now);
  if (kind === "daily") {
    at.setUTCHours(8, 30, 0, 0);
    if (at <= now) at.setUTCDate(at.getUTCDate() + 1);
  } else if (kind === "monthlySeo") {
    at.setUTCDate(4);
    at.setUTCHours(8, 0, 0, 0);
    if (at <= now) at.setUTCMonth(at.getUTCMonth() + 1, 4);
  } else {
    at.setUTCHours(9, 0, 0, 0);
    const daysUntilMonday = (8 - at.getUTCDay()) % 7;
    at.setUTCDate(at.getUTCDate() + daysUntilMonday);
    if (at <= now) at.setUTCDate(at.getUTCDate() + 7);
  }
  return at;
}

function formatNext(at: Date, now: Date): string {
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const day =
    dayKey(at) === dayKey(now)
      ? "Today"
      : dayKey(at) === dayKey(tomorrow)
        ? "Tomorrow"
        : at.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}, ${time} UTC`;
}

export default async function EmailReportsPage() {
  const db = await getDb();
  const recipients = await db.select().from(reportRecipients).orderBy(asc(reportRecipients.email));
  // Only whether it's set up, the sender address, and the names of any
  // missing settings — never the key.
  const { from, missing } = getEmailConfig();
  const configured = missing.length === 0;
  const now = new Date();
  const schedules = {
    dailySummary: { nextSend: formatNext(nextRun(now, "daily"), now) },
    monthlySeo: { nextSend: formatNext(nextRun(now, "monthlySeo"), now) },
    accessReport: { nextSend: formatNext(nextRun(now, "access"), now) },
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="font-heading text-lg font-medium text-foreground">Email reports</h2>
          <p className="text-sm text-muted-foreground">
            Pick who gets each report. They&apos;re sent automatically on the schedule below — use Send now to
            check one looks right.
          </p>
        </div>
        {configured && (
          <span
            className="flex w-fit items-center gap-2 rounded-full border border-success/30 bg-success/5 px-3 py-1.5 text-xs text-foreground"
            title="Email sending is set up"
          >
            <MailCheckIcon className="size-3.5 shrink-0 text-success" aria-hidden />
            Sending from <span className="font-medium">{from}</span>
          </span>
        )}
      </div>

      {!configured && (
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
        schedules={schedules}
        recipients={recipients.map((r) => ({
          id: r.id,
          email: r.email,
          dailySummary: r.dailySummary,
          monthlySeo: r.monthlySeo,
          accessReport: r.accessReport,
        }))}
      />
    </div>
  );
}
