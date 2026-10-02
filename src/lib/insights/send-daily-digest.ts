import "server-only";
import { getDashboardData } from "../dashboard/queries";
import { computeAttentionFlags } from "./rules";
import { generateFleetNarrative, type FleetNarrative } from "./narrative";
import { groupDataIssues } from "./data-issues";
import { buildDailyDigest } from "./daily-digest";
import { postToSlack, type SlackPostResult } from "../slack";
import { getAppUrl } from "../app-url";
import { buildDailyDigestEmail } from "../email/templates";
import { emailReport } from "../email/reports";
import type { EmailSendResult } from "../email/resend";

// Shared by the 08:30 cron and the "Send to Slack" button on Insights.
// Goes to Slack and, through Resend, to everyone ticked for the daily
// summary in Settings → Email reports. Either can be off without
// affecting the other. `channels` limits a manual send to one of them.
// Active clients only (getDashboardData) — archived and paused clients are
// never included.
export async function sendDailyDigest(
  now: Date = new Date(),
  channels: { slack: boolean; email: boolean } = { slack: true, email: true },
): Promise<{ slack: SlackPostResult; email: EmailSendResult; narrativeError?: string; flags: number }> {
  const data = await getDashboardData(now);
  const flags = computeAttentionFlags(data);

  let narrative: FleetNarrative | null = null;
  let narrativeError: string | undefined;
  try {
    narrative = await generateFleetNarrative(data, flags);
  } catch (error) {
    narrativeError = error instanceof Error ? error.message : String(error);
  }

  const input = {
    now,
    clientCount: data.rows.length,
    flags,
    dataIssues: narrative?.dataIssues ?? groupDataIssues(flags),
    narrative,
    appUrl: getAppUrl(),
  };

  // Slack and email are independent — one failing must not stop the other.
  const [slack, email] = await Promise.all([
    channels.slack
      ? postToSlack(buildDailyDigest(input), process.env.SLACK_DAILY_CHANNEL_ID).catch(
          (error: unknown): SlackPostResult => ({ posted: false, reason: error instanceof Error ? error.message : String(error) }),
        )
      : Promise.resolve<SlackPostResult>({ posted: false, reason: "Not requested" }),
    channels.email
      ? emailReport("daily", buildDailyDigestEmail(input))
      : Promise.resolve<EmailSendResult>({ sent: false, reason: "Not requested" }),
  ]);
  return { slack, email, narrativeError, flags: flags.length };
}
