export interface SlackPostResult {
  posted: boolean;
  reason?: string;
}

// The same bot and channel as the monthly SEO digest. `text` is the plain
// fallback shown in notifications and search; `blocks` is the rich layout.
// Optional channel override lets one digest go somewhere else later
// without a second Slack app.
export async function postToSlack(
  message: { text: string; blocks: object[] },
  channelOverride?: string,
): Promise<SlackPostResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = channelOverride || process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    return { posted: false, reason: "SLACK_BOT_TOKEN / SLACK_CHANNEL_ID not configured" };
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ...message }),
  });

  const body = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !body.ok) {
    throw new Error(`Slack chat.postMessage failed: ${body.error ?? response.statusText}`);
  }

  return { posted: true };
}

// Slack mrkdwn treats &, < and > as control characters.
export function slackEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
