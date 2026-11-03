import { dailyDigestContent, type DailyDigestInput } from "../insights/daily-digest";
import type { DigestSummary } from "../seo/digest";
import { formatPercent } from "../dashboard/format";
import type { EmailMessage } from "./resend";
import type { AccessReport } from "../settings/access-report";
import type { ClientHealthEntry } from "../analysis/queries";
import { PLATFORM_LABELS } from "../connectors/platform-labels";
import type { Platform } from "../connectors/types";

// Email clients ignore stylesheets and most modern CSS, so these are plain
// tables with inline styles — the one layout that renders the same in
// Gmail, Outlook and Apple Mail. Every email also has a plain-text part.

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const MUTED = "#6b7280";

function layout(title: string, subtitle: string, body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
<tr><td style="padding:24px 28px 8px;">
<div style="font-size:20px;font-weight:600;color:#111827;">${esc(title)}</div>
<div style="font-size:13px;color:${MUTED};margin-top:4px;">${esc(subtitle)}</div>
</td></tr>
<tr><td style="padding:8px 28px 24px;font-size:14px;line-height:1.55;color:#111827;">${body}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:${MUTED};">${footer}</td></tr>
</table>
</td></tr></table></body></html>`;
}

function heading(text: string, color: string): string {
  return `<div style="margin:20px 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${color};">${esc(text)}</div>`;
}

function list(items: string[]): string {
  return `<ul style="margin:0;padding-left:18px;">${items.map((item) => `<li style="margin:4px 0;">${item}</li>`).join("")}</ul>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0 0;"><a href="${esc(href)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px;">${esc(label)}</a></p>`;
}

function footerText(appUrl: string | null): string {
  const settings = appUrl ? ` Change who gets this in <a href="${esc(`${appUrl}/settings/email-reports`)}" style="color:${MUTED};">Settings → Email reports</a>.` : "";
  return `Sent by the Civilized Savage dashboard.${settings}`;
}

export function buildDailyDigestEmail(input: DailyDigestInput): Omit<EmailMessage, "to"> {
  const { date, summary, concerns, wins, dataIssues, usedAi } = dailyDigestContent(input);
  const nameAndNote = (item: { name: string; note: string }) => `<strong>${esc(item.name)}</strong> — ${esc(item.note)}`;

  let body = `<p style="margin:12px 0 0;font-size:15px;">${esc(summary)}</p>`;
  if (concerns.length > 0) body += heading("Needs a look", "#b45309") + list(concerns.map(nameAndNote));
  if (wins.length > 0) body += heading("Going well", "#15803d") + list(wins.map(nameAndNote));
  if (dataIssues.length > 0) {
    body +=
      heading("Not updating", "#b91c1c") +
      list(
        dataIssues.map(
          (issue) =>
            `<strong>${esc(issue.what)}</strong> for ${issue.clients.length} ${issue.clients.length === 1 ? "client" : "clients"}: ${esc(issue.clients.slice(0, 8).join(", "))}${issue.clients.length > 8 ? ` +${issue.clients.length - 8} more` : ""}<br><span style="color:${MUTED};">${esc(issue.reason)}</span>`,
        ),
      );
  }
  if (input.appUrl) body += button(`${input.appUrl}/insights`, "Open Insights");
  body += `<p style="margin:16px 0 0;font-size:12px;color:${MUTED};">${usedAi ? "Summary written by AI from the dashboard's numbers." : "The AI summary wasn't available today, so these are the raw flags."}</p>`;

  const textLines = [`Daily client summary — ${date}`, "", summary];
  if (concerns.length > 0) textLines.push("", "NEEDS A LOOK", ...concerns.map((c) => `- ${c.name}: ${c.note}`));
  if (wins.length > 0) textLines.push("", "GOING WELL", ...wins.map((w) => `- ${w.name}: ${w.note}`));
  if (dataIssues.length > 0)
    textLines.push("", "NOT UPDATING", ...dataIssues.map((i) => `- ${i.what} (${i.clients.length}): ${i.reason}`));
  if (input.appUrl) textLines.push("", `Open Insights: ${input.appUrl}/insights`);

  return {
    subject: `Daily client summary — ${date}`,
    html: layout(
      `Daily client summary — ${date}`,
      `Last 7 days vs the week before · ${input.clientCount} active clients`,
      body,
      footerText(input.appUrl),
    ),
    text: textLines.join("\n"),
  };
}

function pct(value: number | null): string {
  return value === null ? "n/a" : formatPercent(value * 100);
}

export function buildSeoDigestEmail(s: DigestSummary, appUrl: string | null): Omit<EmailMessage, "to"> {
  const tc = s.tierCounts;
  const stat = (label: string, value: string) =>
    `<td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;width:50%;"><div style="font-size:12px;color:${MUTED};">${esc(label)}</div><div style="font-size:18px;font-weight:600;margin-top:2px;">${esc(value)}</div></td>`;

  let body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-top:8px;">
<tr>${stat("Google clicks this month", s.clicksNewest.toLocaleString())}${stat("vs last month", pct(s.momPct))}</tr>
<tr>${stat("Keywords gained / lost", `+${s.keywordsGained} / -${s.keywordsLost}`)}${stat("New referring domains", s.newReferringDomainsSum.toLocaleString())}</tr>
</table>`;
  body += heading("Clients by size", MUTED);
  body += `<p style="margin:0;">Strong ${tc.strong} · Moderate ${tc.moderate} · Small ${tc.small} · Minimal ${tc.minimal} · No data ${tc.no_data}</p>`;
  if (s.fallingFast.length > 0) body += heading(`Falling fast (${s.fallingFast.length})`, "#b91c1c") + `<p style="margin:0;">${esc(s.fallingFast.join(", "))}</p>`;
  if (s.growingFast.length > 0) body += heading(`Growing fast (${s.growingFast.length})`, "#15803d") + `<p style="margin:0;">${esc(s.growingFast.join(", "))}</p>`;
  if (s.lowVolCount > 0)
    body += `<p style="margin:14px 0 0;font-size:12px;color:${MUTED};">${s.lowVolCount} client(s) have too few clicks for a trend to mean anything, so they're left out of the above.</p>`;
  if (appUrl) body += button(`${appUrl}/seo`, "Open the SEO page");

  const text = [
    `SEO monthly summary — ${s.newestMonth}`,
    "",
    `Google clicks this month: ${s.clicksNewest.toLocaleString()} (${pct(s.momPct)} vs last month)`,
    `Keywords: +${s.keywordsGained} gained / -${s.keywordsLost} lost`,
    `New referring domains: ${s.newReferringDomainsSum}`,
    `Clients by size: Strong ${tc.strong}, Moderate ${tc.moderate}, Small ${tc.small}, Minimal ${tc.minimal}, No data ${tc.no_data}`,
    s.fallingFast.length > 0 ? `Falling fast: ${s.fallingFast.join(", ")}` : "",
    s.growingFast.length > 0 ? `Growing fast: ${s.growingFast.join(", ")}` : "",
    appUrl ? `\nOpen the SEO page: ${appUrl}/seo` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    subject: `SEO monthly summary — ${s.newestMonth}`,
    html: layout(`SEO monthly summary — ${s.newestMonth}`, `${s.totalClients} active clients · ${s.oldestMonth} to ${s.newestMonth}`, body, footerText(appUrl)),
    text,
  };
}

export function buildAccessReportEmail(report: AccessReport, appUrl: string | null): Omit<EmailMessage, "to"> {
  const date = report.generatedAt.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const problems = report.notWorking.length + report.notChecked.length;
  const summary =
    problems === 0
      ? "Every connected account is working."
      : `${report.notWorking.length} connected ${report.notWorking.length === 1 ? "account isn't" : "accounts aren't"} working${report.notChecked.length > 0 ? `, and ${report.notChecked.length} ${report.notChecked.length === 1 ? "hasn't" : "haven't"} been checked yet` : ""}.`;

  let body = `<p style="margin:12px 0 0;font-size:15px;">${esc(summary)}</p>`;
  if (report.notWorking.length > 0) {
    body +=
      heading(`Not working — give access or fix (${report.notWorking.length})`, "#b91c1c") +
      list(
        report.notWorking.map(
          (r) => `<strong>${esc(r.clientName)}</strong> · ${esc(r.platform)}<br><span style="color:${MUTED};">${esc(r.reason)}</span>`,
        ),
      );
  }
  if (report.notChecked.length > 0) {
    body +=
      heading(`Not checked yet (${report.notChecked.length})`, "#b45309") +
      list(report.notChecked.map((r) => `<strong>${esc(r.clientName)}</strong> · ${esc(r.platform)}`));
  }
  if (report.notConnected.length > 0) {
    body +=
      heading("Not connected", MUTED) +
      `<p style="margin:0 0 6px;font-size:13px;color:${MUTED};">Clients with no account set up for a platform — either they don't use it, or access still needs to be given.</p>` +
      list(
        report.notConnected.map(
          (g) =>
            `<strong>${esc(g.platform)}</strong> (${g.clients.length}): ${esc(g.clients.slice(0, 12).join(", "))}${g.clients.length > 12 ? ` +${g.clients.length - 12} more` : ""}`,
        ),
      );
  }
  if (appUrl) body += button(`${appUrl}/settings/clients`, "Fix in Settings → Clients");

  const text = [
    `Account access report — ${date}`,
    "",
    summary,
    ...(report.notWorking.length > 0
      ? ["", "NOT WORKING — GIVE ACCESS OR FIX", ...report.notWorking.map((r) => `- ${r.clientName} · ${r.platform}: ${r.reason}`)]
      : []),
    ...(report.notChecked.length > 0 ? ["", "NOT CHECKED YET", ...report.notChecked.map((r) => `- ${r.clientName} · ${r.platform}`)] : []),
    ...(report.notConnected.length > 0
      ? ["", "NOT CONNECTED", ...report.notConnected.map((g) => `- ${g.platform} (${g.clients.length}): ${g.clients.join(", ")}`)]
      : []),
    ...(appUrl ? ["", `Fix in Settings → Clients: ${appUrl}/settings/clients`] : []),
  ].join("\n");

  return {
    subject: `Account access report — ${problems === 0 ? "all working" : `${problems} to fix`}`,
    html: layout(`Account access report — ${date}`, `${report.clientCount} active clients`, body, footerText(appUrl)),
    text,
  };
}

function scoreColor(score: number): string {
  return score >= 80 ? "#15803d" : score >= 60 ? "#2563eb" : score >= 40 ? "#b45309" : "#b91c1c";
}

export function buildMonthlyAnalysisEmail(entries: ClientHealthEntry[], appUrl: string | null): Omit<EmailMessage, "to"> {
  const period = entries.find((e) => e.periodLabel)?.periodLabel ?? "";
  const needWork = entries.filter((e) => e.healthScore < 60).length;
  const average = entries.length ? Math.round(entries.reduce((t, e) => t + e.healthScore, 0) / entries.length) : 0;
  const summary =
    entries.length === 0
      ? "No client analyses were written this month."
      : `${entries.length} clients analysed, average health ${average}/100. ${needWork === 0 ? "None need urgent work." : `${needWork} ${needWork === 1 ? "needs" : "need"} work (under 60).`}`;
  const platformName = (p: string) => (p === "leads" ? "Leads" : (PLATFORM_LABELS[p as Platform] ?? p));

  let body = `<p style="margin:12px 0 0;font-size:15px;">${esc(summary)}</p>`;
  if (entries.length > 0) {
    body += heading("Weakest first", MUTED);
    body += entries
      .map((e) => {
        const link = appUrl ? `${appUrl}/settings/clients/${e.clientId}#analysis` : null;
        const name = link ? `<a href="${esc(link)}" style="color:#111827;text-decoration:none;">${esc(e.clientName)}</a>` : esc(e.clientName);
        const actions =
          e.topActions.length > 0
            ? `<ul style="margin:4px 0 0;padding-left:18px;color:#374151;">${e.topActions
                .map((a) => `<li style="margin:2px 0;">${a.priority === "high" ? "<strong>High:</strong> " : ""}${esc(a.title)} <span style="color:${MUTED};">· ${esc(platformName(a.platform))}</span></li>`)
                .join("")}</ul>`
            : "";
        return `<div style="padding:10px 0;border-top:1px solid #f0f1f3;"><span style="display:inline-block;min-width:34px;font-weight:700;color:${scoreColor(e.healthScore)};">${e.healthScore}</span> <strong>${name}</strong><div style="color:#374151;margin-top:2px;">${esc(e.headline)}</div>${actions}</div>`;
      })
      .join("");
  }
  if (appUrl) body += button(`${appUrl}/insights#client-health`, "Open client health");

  const text = [
    `Monthly client analysis${period ? ` — ${period}` : ""}`,
    "",
    summary,
    "",
    ...entries.flatMap((e) => [
      `${e.healthScore}/100  ${e.clientName}: ${e.headline}`,
      ...e.topActions.map((a) => `   - ${a.priority === "high" ? "[High] " : ""}${a.title} (${platformName(a.platform)})`),
    ]),
    ...(appUrl ? ["", `Open client health: ${appUrl}/insights#client-health`] : []),
  ].join("\n");

  return {
    subject: `Monthly client analysis${period ? ` — ${period}` : ""}${needWork > 0 ? ` · ${needWork} need work` : ""}`,
    html: layout(`Monthly client analysis${period ? ` — ${period}` : ""}`, `${entries.length} clients · written by AI from each client's numbers`, body, footerText(appUrl)),
    text,
  };
}

export interface LeadReviewEmailEntry {
  reportId: string;
  clientName: string;
  periodLabel: string;
  headline: string;
  tier1: number;
  open: number;
}

// To the team: new AI lead reports are waiting for review before anything
// goes to a client.
export function buildLeadReviewEmail(entries: LeadReviewEmailEntry[], appUrl: string | null): Omit<EmailMessage, "to"> {
  const title = entries.length === 1 ? `Lead report ready for review — ${entries[0].clientName}` : `${entries.length} lead reports ready for review`;
  let body = `<p style="margin:12px 0 0;">Review each report, add remarks, and approve it before it's sent to the client.</p>`;
  body += entries
    .map((e) => {
      const link = appUrl ? `${appUrl}/settings/lead-reports/${e.reportId}` : null;
      const name = link ? `<a href="${esc(link)}" style="color:#111827;">${esc(e.clientName)}</a>` : esc(e.clientName);
      return `<div style="padding:10px 0;border-top:1px solid #f0f1f3;"><strong>${name}</strong> <span style="color:${MUTED};">· ${esc(e.periodLabel)}</span><div style="color:#374151;margin-top:2px;">${esc(e.headline)}</div><div style="color:${MUTED};font-size:13px;margin-top:2px;">${e.tier1} to call today · ${e.open} open leads</div></div>`;
    })
    .join("");
  if (appUrl) body += button(`${appUrl}/settings/lead-reports`, "Open the review queue");
  const text = [
    title,
    "",
    ...entries.map((e) => `${e.clientName} (${e.periodLabel}): ${e.headline} — ${e.tier1} to call today, ${e.open} open${appUrl ? `\n  ${appUrl}/settings/lead-reports/${e.reportId}` : ""}`),
  ].join("\n");
  return { subject: title, html: layout(title, "AI lead analysis · needs a reviewer", body, footerText(appUrl)), text };
}

// To the client: the approved report, PDF attached.
export function buildLeadClientEmail(input: {
  clientName: string;
  periodLabel: string;
  headline: string;
  intro: string;
  tier1: number;
  tier2: number;
  open: number;
  message: string | null;
}): Omit<EmailMessage, "to"> {
  const title = `Your sales call priority list — ${input.periodLabel}`;
  const note = input.message?.trim() ? `<p style="margin:12px 0 0;white-space:pre-line;">${esc(input.message.trim())}</p>` : "";
  const body = `${note}<p style="margin:12px 0 0;font-size:15px;font-weight:600;">${esc(input.headline)}</p><p style="margin:8px 0 0;">${esc(input.intro)}</p><p style="margin:12px 0 0;color:#374151;"><strong>${input.tier1}</strong> leads to call today · <strong>${input.tier2}</strong> this week · ${input.open} open in total.</p><p style="margin:12px 0 0;">The full ranked list, with contact details and an opener for each call, is in the attached PDF.</p>`;
  const text = [
    title,
    "",
    ...(input.message?.trim() ? [input.message.trim(), ""] : []),
    input.headline,
    input.intro,
    "",
    `${input.tier1} to call today, ${input.tier2} this week, ${input.open} open in total.`,
    "The full ranked list is in the attached PDF.",
  ].join("\n");
  return { subject: `${input.clientName} — sales call priority list, ${input.periodLabel}`, html: layout(title, input.clientName, body, "Prepared by Civilized Savage."), text };
}
