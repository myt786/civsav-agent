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

// Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email)
// rather than its SMTP relay: same service and the same API key, but no
// SMTP client library to add, and a clear JSON error when something's off.
// Needs RESEND_API_KEY and REPORTS_FROM_EMAIL (an address on a domain
// verified in Resend, e.g. "civsav reports <reports@civsav.com>").
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORTS_FROM_EMAIL;
  if (!apiKey || !from) {
    return { sent: false, reason: "RESEND_API_KEY / REPORTS_FROM_EMAIL not configured" };
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
