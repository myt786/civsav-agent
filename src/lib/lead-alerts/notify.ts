import "server-only";
import { getAppUrl } from "../app-url";
import { getReportRecipients } from "../email/reports";
import { sendEmail } from "../email/resend";
import { buildLeadAlertEmail } from "../email/templates";
import { postToSlack, slackEscape } from "../slack";
import type { LeadAlertKind, LeadAlertSeverity, LeadFinding } from "./detect";

export interface LeadAlertEvent {
  type: "new" | "reminder" | "resolved";
  alertId: string;
  clientId: string;
  clientName: string;
  owner: string | null;
  kind: LeadAlertKind;
  severity: LeadAlertSeverity;
  message: string;
  detail: LeadFinding["detail"];
  openedAt?: string;
}

function icon(e: LeadAlertEvent): string {
  if (e.type === "resolved") return "✅";
  return e.severity === "critical" ? "🔴" : "🟠";
}

function slackLine(e: LeadAlertEvent, appUrl: string | null): string {
  const name = appUrl ? `<${appUrl}/insights#lead-alerts|${slackEscape(e.clientName)}>` : slackEscape(e.clientName);
  const prefix = e.type === "reminder" ? "_Still open:_ " : "";
  const owner = e.owner && e.type !== "resolved" ? ` · ${slackEscape(e.owner.split("@")[0])}` : "";
  const last = e.type !== "resolved" && e.detail.lastLeadDate ? ` · last lead ${e.detail.lastLeadDate}` : "";
  return `${icon(e)} *${name}* — ${prefix}${slackEscape(e.message)}${last}${owner}`;
}

export async function notifyLeadAlerts(events: LeadAlertEvent[]): Promise<{ slack: string; email: string }> {
  if (events.length === 0) return { slack: "nothing to send", email: "nothing to send" };
  const appUrl = getAppUrl();
  const order = { new: 0, reminder: 1, resolved: 2 } as const;
  const sorted = [...events].sort(
    (a, b) => order[a.type] - order[b.type] || (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1),
  );

  let slack = "sent";
  try {
    const problems = sorted.filter((e) => e.type !== "resolved").length;
    const text = problems > 0 ? `Lead alerts: ${problems} client${problems === 1 ? "" : "s"} need a look` : "Lead alerts: leads are back";
    const result = await postToSlack(
      {
        text,
        blocks: [
          { type: "header", text: { type: "plain_text", text: problems > 0 ? "🚨 Lead alerts" : "✅ Leads are back" } },
          { type: "section", text: { type: "mrkdwn", text: sorted.map((e) => slackLine(e, appUrl)).join("\n").slice(0, 2900) } },
          ...(appUrl
            ? [{ type: "context", elements: [{ type: "mrkdwn", text: `<${appUrl}/insights#lead-alerts|Open lead alerts> to acknowledge and add a note.` }] }]
            : []),
        ],
      },
      process.env.LEAD_ALERTS_SLACK_CHANNEL_ID || undefined,
    );
    if (!result.posted) slack = result.reason ?? "not posted";
  } catch (error) {
    slack = error instanceof Error ? error.message : String(error);
  }

  // Each client's owner gets their own clients; clients with no owner go to
  // the people who get the daily client summary.
  let email = "sent";
  try {
    const byRecipient = new Map<string, LeadAlertEvent[]>();
    const fallback = sorted.some((e) => !e.owner) ? await getReportRecipients("daily") : [];
    for (const e of sorted) {
      for (const to of e.owner ? [e.owner] : fallback) byRecipient.set(to, [...(byRecipient.get(to) ?? []), e]);
    }
    if (byRecipient.size === 0) email = "no recipients";
    for (const [to, list] of byRecipient) {
      const result = await sendEmail({ to: [to], ...buildLeadAlertEmail(list, appUrl) });
      if (!result.sent) email = result.reason ?? "not sent";
    }
  } catch (error) {
    email = error instanceof Error ? error.message : String(error);
  }
  return { slack, email };
}
