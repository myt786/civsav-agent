import { format } from "date-fns";
import { slackEscape } from "../slack";
import type { DataIssue } from "./data-issues";
import { isDataFlag } from "./data-issues";
import type { AttentionFlag } from "./types";

export interface DailyDigestInput {
  now: Date;
  clientCount: number;
  flags: AttentionFlag[];
  dataIssues: DataIssue[];
  // Null when the AI summary couldn't be written — the digest still goes
  // out with the rule-based flags, which never depend on a model call.
  narrative: {
    fleetSummary: string;
    clientNotes: { clientName: string; tone: "concern" | "good"; note: string }[];
  } | null;
  appUrl: string | null;
}

// Slack caps a section's text at 3000 characters.
const SECTION_LIMIT = 2900;
const MAX_NAMES = 6;

function clip(text: string): string {
  return text.length > SECTION_LIMIT ? `${text.slice(0, SECTION_LIMIT - 1)}…` : text;
}

function section(text: string): object {
  return { type: "section", text: { type: "mrkdwn", text: clip(text) } };
}

function nameList(names: string[]): string {
  const shown = names.slice(0, MAX_NAMES).map(slackEscape).join(", ");
  return names.length > MAX_NAMES ? `${shown} +${names.length - MAX_NAMES} more` : shown;
}

function bullets(items: { name: string; note: string }[]): string {
  return items.map((item) => `•  *${slackEscape(item.name)}* — ${slackEscape(item.note)}`).join("\n");
}

// What the daily summary says, independent of where it's sent — shared by
// the Slack message below and the email (lib/email/templates.ts) so the two
// never disagree.
export function dailyDigestContent(input: DailyDigestInput) {
  const { now, flags, dataIssues, narrative } = input;
  const date = format(now, "EEE d MMM");
  const performanceFlags = flags.filter((f) => !isDataFlag(f));

  const summary = narrative
    ? narrative.fleetSummary
    : performanceFlags.length === 0 && dataIssues.length === 0
      ? "Nothing needs attention today."
      : `${new Set(flags.map((f) => f.clientId)).size} clients have something worth a look.`;

  const concerns = narrative
    ? narrative.clientNotes.filter((n) => n.tone === "concern").map((n) => ({ name: n.clientName, note: n.note }))
    : performanceFlags.map((f) => ({ name: f.clientName, note: f.message }));
  const wins = narrative
    ? narrative.clientNotes.filter((n) => n.tone === "good").map((n) => ({ name: n.clientName, note: n.note }))
    : [];

  return { date, summary, concerns: concerns.slice(0, 12), wins: wins.slice(0, 12), dataIssues, usedAi: narrative !== null };
}

export function buildDailyDigest(input: DailyDigestInput): { text: string; blocks: object[] } {
  const { clientCount, appUrl } = input;
  const { date, summary, concerns, wins, dataIssues, usedAi } = dailyDigestContent(input);

  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: `📋 Daily client summary — ${date}`, emoji: true } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Last 7 days vs the week before · ${clientCount} active clients` }],
    },
    section(slackEscape(summary)),
  ];

  if (concerns.length > 0 || wins.length > 0 || dataIssues.length > 0) blocks.push({ type: "divider" });
  if (concerns.length > 0) blocks.push(section(`*🟠 Needs a look*\n${bullets(concerns)}`));
  if (wins.length > 0) blocks.push(section(`*🟢 Going well*\n${bullets(wins)}`));
  if (dataIssues.length > 0) {
    const lines = dataIssues.map(
      (issue) =>
        `•  *${slackEscape(issue.what)}* not updating for ${issue.clients.length} ${issue.clients.length === 1 ? "client" : "clients"}: ${nameList(issue.clients)}\n      _${slackEscape(issue.reason)}_`,
    );
    blocks.push(section(`*🔴 Not updating*\n${lines.join("\n")}`));
  }

  const footer = [usedAi ? "Summary written by AI from the dashboard's numbers." : "AI summary unavailable today — showing the raw flags."];
  if (appUrl) footer.push(`<${appUrl}/insights|Open Insights>`);
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: footer.join("  ·  ") }] });

  return { text: `Daily client summary — ${date}: ${summary}`, blocks };
}
