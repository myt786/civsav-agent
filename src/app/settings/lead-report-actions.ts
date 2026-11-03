"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db";
import { clients, leadReports } from "@/lib/db/schema";
import { isUuid } from "@/lib/settings/validation";
import { isLeadTone } from "@/lib/lead-report/tone";
import { getLeadReport } from "@/lib/lead-report/queries";
import { emailLeadReportToClient } from "@/lib/lead-report/email";
import { newEventId } from "@/lib/lead-report/generate";
import type { LeadReportEvent } from "@/lib/lead-report/types";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function parseEmails(raw: string): { emails: string[]; bad: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const emails = [...new Set(parts.filter((p) => EMAIL.test(p)))];
  const bad = parts.filter((p) => !EMAIL.test(p));
  return { emails, bad };
}

function refresh(id?: string) {
  revalidatePath("/settings/lead-reports");
  if (id) revalidatePath(`/settings/lead-reports/${id}`);
}

// Per client: how often a report is made, its default tone and wording
// guidance, and who at the client receives the approved PDF.
export async function saveLeadReportSettings(input: {
  clientId: string;
  cadence: string;
  tone: string;
  toneNote: string;
  emails: string;
}): Promise<{ error?: string }> {
  await requireSession();
  if (!isUuid(input.clientId)) return { error: "That client wasn't found." };
  if (!["off", "weekly", "monthly"].includes(input.cadence)) return { error: "Pick off, weekly or monthly." };
  if (!isLeadTone(input.tone)) return { error: "Pick a tone." };
  const { emails, bad } = parseEmails(input.emails ?? "");
  if (bad.length > 0) return { error: `Not an email address: ${bad.slice(0, 3).join(", ")}` };
  const db = await getDb();
  await db
    .update(clients)
    .set({
      leadReportCadence: input.cadence,
      leadReportTone: input.tone,
      leadReportToneNote: input.toneNote?.trim().slice(0, 400) || null,
      leadReportEmails: emails,
    })
    .where(eq(clients.id, input.clientId));
  refresh();
  return {};
}

async function appendEvent(
  id: string,
  event: Omit<LeadReportEvent, "id" | "at">,
  patch: Partial<typeof leadReports.$inferInsert> = {},
): Promise<{ error?: string }> {
  const db = await getDb();
  const rows = await db.select({ events: leadReports.events }).from(leadReports).where(eq(leadReports.id, id)).limit(1);
  if (!rows[0]) return { error: "That report wasn't found." };
  const events = [...((rows[0].events as LeadReportEvent[]) ?? []), { ...event, id: newEventId(), at: new Date().toISOString() }];
  await db.update(leadReports).set({ ...patch, events }).where(eq(leadReports.id, id));
  refresh(id);
  return {};
}

export async function addLeadReportRemark(id: string, text: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isUuid(id)) return { error: "That report wasn't found." };
  const remark = text?.trim();
  if (!remark) return { error: "Write a remark first." };
  return appendEvent(id, { kind: "remark", by: session.email, text: remark.slice(0, 2000) });
}

// Approve (ready to send) or ask for changes, with an optional note.
export async function decideLeadReport(id: string, decision: "approve" | "changes", note: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isUuid(id) || !["approve", "changes"].includes(decision)) return { error: "That report wasn't found." };
  const report = await getLeadReport(id);
  if (!report) return { error: "That report wasn't found." };
  if (report.status === "sent") return { error: "This report was already sent." };
  const text = note?.trim().slice(0, 2000) || null;
  return decision === "approve"
    ? appendEvent(id, { kind: "approved", by: session.email, text }, { status: "approved", approvedBy: session.email, approvedAt: new Date() })
    : appendEvent(id, { kind: "changes_requested", by: session.email, text }, { status: "changes_requested", approvedBy: null, approvedAt: null });
}

// Reviewers can reword the summary before it goes out; editing an
// approved report sends it back to review.
export async function editLeadReportSummary(id: string, headline: string, intro: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isUuid(id)) return { error: "That report wasn't found." };
  const row = await getLeadReport(id);
  if (!row) return { error: "That report wasn't found." };
  if (row.status === "sent") return { error: "This report was already sent." };
  if (!headline.trim() || !intro.trim()) return { error: "The headline and summary can't be empty." };
  const report = { ...row.report, summary: { ...row.report.summary, headline: headline.trim().slice(0, 200), intro: intro.trim().slice(0, 2000) } };
  return appendEvent(
    id,
    { kind: "edited", by: session.email, text: "Edited the summary" },
    { report, ...(row.status === "approved" ? { status: "in_review", approvedBy: null, approvedAt: null } : {}) },
  );
}

export async function sendLeadReportToClient(id: string, recipients: string, message: string): Promise<{ error?: string; sentTo?: string[] }> {
  const session = await requireSession();
  if (!isUuid(id)) return { error: "That report wasn't found." };
  const row = await getLeadReport(id);
  if (!row) return { error: "That report wasn't found." };
  if (row.status !== "approved" && row.status !== "sent") return { error: "A reviewer needs to approve this report before it's sent." };
  const { emails, bad } = parseEmails(recipients ?? "");
  if (bad.length > 0) return { error: `Not an email address: ${bad.slice(0, 3).join(", ")}` };
  if (emails.length === 0) return { error: "Add at least one client email address." };

  try {
    const result = await emailLeadReportToClient(row, emails, message?.trim() || null, session.email);
    if (!result.sent) return { error: result.reason ?? "The email wasn't sent." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The email wasn't sent." };
  }

  const db = await getDb();
  // Remember the addresses for next time.
  await db.update(clients).set({ leadReportEmails: emails }).where(eq(clients.id, row.clientId));
  const res = await appendEvent(
    id,
    { kind: "sent", by: session.email, text: `Sent to ${emails.join(", ")}` },
    { status: "sent", sentAt: new Date(), sentTo: emails },
  );
  return res.error ? res : { sentTo: emails };
}
