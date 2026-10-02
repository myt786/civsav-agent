export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  sent: boolean;
  reason?: string;
}

// The sender can be under any of these names — whichever was used when it
// was added in Vercel.
const FROM_ENV_NAMES = ["REPORTS_FROM_EMAIL", "RESEND_FROM_EMAIL", "RESEND_FROM", "EMAIL_FROM"] as const;

export interface EmailConfig {
  apiKey: string | null;
  from: string | null;
  // Names (never values) of what's missing, for the Settings page.
  missing: string[];
}

export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim() || null;
  const fromName = FROM_ENV_NAMES.find((name) => process.env[name]?.trim());
  const from = fromName ? process.env[fromName]!.trim() : null;
  const missing = [!apiKey ? "RESEND_API_KEY" : null, !from ? "REPORTS_FROM_EMAIL" : null].filter(
    (name): name is string => name !== null,
  );
  return { apiKey, from, missing };
}

// Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email)
// rather than its SMTP relay: same service and the same API key, but no
// SMTP client library to add, and a clear JSON error when something's off.
// Needs RESEND_API_KEY and REPORTS_FROM_EMAIL (an address on a domain
// verified in Resend, e.g. "civsav reports <reports@civsav.com>").
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const { apiKey, from, missing } = getEmailConfig();
  if (!apiKey || !from) {
    return { sent: false, reason: `Email isn't set up: ${missing.join(" and ")} missing` };
  }
  if (message.to.length === 0) return { sent: false, reason: "No recipients" };

  // Each recipient gets their own copy (Resend's batch endpoint), so no one
  // sees everyone else's address in the To line.
  const response = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      message.to.map((to) => ({ from, to: [to], subject: message.subject, html: message.html, text: message.text })),
    ),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Resend rejected the email: ${body?.message ?? response.statusText}`);
  }
  return { sent: true };
}
