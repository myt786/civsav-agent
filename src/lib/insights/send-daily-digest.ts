import "server-only";
import { getDashboardData } from "../dashboard/queries";
import { computeAttentionFlags } from "./rules";
import { generateFleetNarrative, type FleetNarrative } from "./narrative";
import { groupDataIssues } from "./data-issues";
import { buildDailyDigest } from "./daily-digest";
import { postToSlack, type SlackPostResult } from "../slack";

// Shared by the 08:30 cron and the "Send to Slack" button on Insights.
// Active clients only (getDashboardData) — archived and paused clients are
// never included.
export async function sendDailyDigest(
  now: Date = new Date(),
): Promise<{ slack: SlackPostResult; narrativeError?: string; flags: number }> {
  const data = await getDashboardData(now);
  const flags = computeAttentionFlags(data);

  let narrative: FleetNarrative | null = null;
  let narrativeError: string | undefined;
  try {
    narrative = await generateFleetNarrative(data, flags);
  } catch (error) {
    narrativeError = error instanceof Error ? error.message : String(error);
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const appUrl = process.env.APP_URL || (productionHost ? `https://${productionHost}` : null);

  const message = buildDailyDigest({
    now,
    clientCount: data.rows.length,
    flags,
    dataIssues: narrative?.dataIssues ?? groupDataIssues(flags),
    narrative,
    appUrl,
  });
  const slack = await postToSlack(message, process.env.SLACK_DAILY_CHANNEL_ID);
  return { slack, narrativeError, flags: flags.length };
}
