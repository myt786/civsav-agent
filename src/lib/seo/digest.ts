import { format } from "date-fns";
import { formatPercent } from "../dashboard/format";
import type { SeoDashboardData } from "./types";

// Port of build_slack_message()/build_slack_blocks() in the Python
// pipeline's run_monthly.py — the Google Sheet links and clients.json
// sync-report ("what's new") sections are dropped since neither exists in
// this pipeline (the Sheet push was retired, and there's no separate
// roster-reconciliation step here).
export function buildDigestSummary(data: SeoDashboardData, now: Date = new Date()) {
  const { aggregates, rows } = data;
  const [oldestMonth, , newestMonth] = data.months;

  const fallingFast = rows.filter((r) => r.trend === "falling_fast").map((r) => r.clientName);
  const growingFast = rows.filter((r) => r.trend === "growing_fast").map((r) => r.clientName);
  const lowVolCount = rows.filter((r) => r.trend === "low_vol").length;

  const keywordsGained = rows.reduce((sum, r) => sum + (r.keywordsGained.kind === "ok" || r.keywordsGained.kind === "unverified" ? r.keywordsGained.value : 0), 0);
  const keywordsLost = rows.reduce((sum, r) => sum + (r.keywordsLost.kind === "ok" || r.keywordsLost.kind === "unverified" ? r.keywordsLost.value : 0), 0);
  const clicksNewest = rows.reduce((sum, r) => {
    const newestCell = r.months.at(-1)?.clicks;
    const value = newestCell?.kind === "ok" || newestCell?.kind === "unverified" ? newestCell.value : 0;
    return sum + value;
  }, 0);

  return {
    generatedAt: format(now, "yyyy-MM-dd"),
    oldestMonth,
    newestMonth,
    totalClients: rows.length,
    clicksNewest,
    momPct: aggregates.portfolioMomPct,
    tierCounts: aggregates.tierCounts,
    keywordsGained,
    keywordsLost,
    newReferringDomainsSum: aggregates.newReferringDomainsSum,
    fallingFast,
    growingFast,
    lowVolCount,
  };
}

export type DigestSummary = ReturnType<typeof buildDigestSummary>;

function fmtPct(pct: number | null): string {
  return pct === null ? "n/a" : formatPercent(pct * 100);
}

export function buildDigestText(s: DigestSummary): string {
  const lines: string[] = [`*📊 SEO Portfolio Dashboard — ${s.generatedAt}*`];
  const tc = s.tierCounts;

  lines.push(`${s.totalClients} active clients | Window: ${s.oldestMonth} → ${s.newestMonth}`);
  lines.push(`*Clicks:* ${s.clicksNewest.toLocaleString()} this month (${fmtPct(s.momPct)} MoM)`);
  lines.push(
    `*Tiers:* 🟢 ${tc.strong}  🟡 ${tc.moderate}  🟠 ${tc.small}  🔴 ${tc.minimal}  ⚫ ${tc.no_data}`,
  );
  lines.push(`*Keywords:* +${s.keywordsGained} gained / -${s.keywordsLost} lost this month`);
  lines.push(`*New Referring Domains:* ${s.newReferringDomainsSum}`);

  if (s.fallingFast.length > 0) {
    lines.push(`\n*⚠️ Falling fast (${s.fallingFast.length}):* ${s.fallingFast.join(", ")}`);
  }
  if (s.growingFast.length > 0) {
    lines.push(`*🚀 Growing fast (${s.growingFast.length}):* ${s.growingFast.join(", ")}`);
  }
  if (s.lowVolCount > 0) {
    lines.push(`_${s.lowVolCount} client(s) below the volume floor — trend suppressed as noise._`);
  }

  return lines.join("\n");
}

export function buildDigestBlocks(s: DigestSummary): object[] {
  const tc = s.tierCounts;
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: "📊 SEO Portfolio Dashboard", emoji: true } },
    { type: "context", elements: [{ type: "mrkdwn", text: `Generated ${s.generatedAt}` }] },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Active Clients*\n${s.totalClients}` },
        { type: "mrkdwn", text: `*Window*\n${s.oldestMonth} → ${s.newestMonth}` },
        { type: "mrkdwn", text: `*Clicks (this month)*\n${s.clicksNewest.toLocaleString()}` },
        { type: "mrkdwn", text: `*MoM Change*\n${fmtPct(s.momPct)}` },
        { type: "mrkdwn", text: `*Keywords*\n+${s.keywordsGained} gained / -${s.keywordsLost} lost` },
        { type: "mrkdwn", text: `*New Referring Domains*\n${s.newReferringDomainsSum.toLocaleString()}` },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Tiers*\n🟢 Strong \`${tc.strong}\`   🟡 Moderate \`${tc.moderate}\`   🟠 Small \`${tc.small}\`   🔴 Minimal \`${tc.minimal}\`   ⚫ No Data \`${tc.no_data}\``,
      },
    },
  ];

  if (s.fallingFast.length > 0 || s.growingFast.length > 0) {
    blocks.push({ type: "divider" });
  }
  if (s.fallingFast.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:rotating_light: *Falling fast (${s.fallingFast.length})*\n${s.fallingFast.join(", ")}` },
    });
  }
  if (s.growingFast.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:rocket: *Growing fast (${s.growingFast.length})*\n${s.growingFast.join(", ")}` },
    });
  }
  if (s.lowVolCount > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `${s.lowVolCount} client(s) below the volume floor — trend suppressed as noise.` }],
    });
  }

  return blocks;
}

export interface SlackPostResult {
  posted: boolean;
  reason?: string;
}

// `text` is the plain fallback shown in notifications/search and by
// clients that don't render Block Kit; `blocks` is the rich rendering —
// same split as the Python original.
export async function postSeoDigestToSlack(summary: DigestSummary): Promise<SlackPostResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    return { posted: false, reason: "SLACK_BOT_TOKEN / SLACK_CHANNEL_ID not configured" };
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text: buildDigestText(summary), blocks: buildDigestBlocks(summary) }),
  });

  const body = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !body.ok) {
    throw new Error(`Slack chat.postMessage failed: ${body.error ?? response.statusText}`);
  }

  return { posted: true };
}
