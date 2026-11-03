import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { clientPlatformAccounts, clients, leadReports } from "../db/schema";
import { isLeadTone } from "./tone";
import type { LeadCadence, LeadReport, LeadReportEvent, LeadReportKind, LeadReportListEntry, LeadReportRow, LeadReportStatus } from "./types";

type Row = typeof leadReports.$inferSelect;

function toRow(row: Row, clientName: string): LeadReportRow {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName,
    kind: row.kind as LeadReportKind,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status as LeadReportStatus,
    tone: isLeadTone(row.tone) ? row.tone : "neutral",
    report: row.report as LeadReport,
    events: (row.events as LeadReportEvent[]) ?? [],
    createdBy: row.createdBy,
    generatedAt: row.generatedAt.toISOString(),
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    sentTo: row.sentTo ?? [],
  };
}

export async function getLeadReport(id: string): Promise<LeadReportRow | null> {
  const db = await getDb();
  const rows = await db.select().from(leadReports).where(eq(leadReports.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, row.clientId)).limit(1);
  return toRow(row, client?.name ?? "Unknown client");
}

export async function listLeadReports(limit = 200): Promise<LeadReportListEntry[]> {
  const db = await getDb();
  const rows = await db.select().from(leadReports).orderBy(desc(leadReports.generatedAt)).limit(limit);
  const ids = [...new Set(rows.map((r) => r.clientId))];
  const names = ids.length
    ? await db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, ids))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  return rows.map((row) => {
    const full = toRow(row, nameOf.get(row.clientId) ?? "Unknown client");
    return {
      id: full.id,
      clientId: full.clientId,
      clientName: full.clientName,
      kind: full.kind,
      periodStart: full.periodStart,
      periodEnd: full.periodEnd,
      status: full.status,
      tone: full.tone,
      generatedAt: full.generatedAt,
      counts: full.report.counts,
      remarks: full.events.filter((e) => e.kind === "remark").length,
      approvedBy: full.approvedBy,
      sentAt: full.sentAt,
    };
  });
}

export interface LeadReportSchedule {
  clientId: string;
  clientName: string;
  cadence: LeadCadence;
  tone: string;
  toneNote: string | null;
  emails: string[];
  hasLeadSource: boolean;
}

export async function listLeadReportSchedules(): Promise<LeadReportSchedule[]> {
  const db = await getDb();
  const [rows, accounts] = await Promise.all([
    db.select().from(clients).where(eq(clients.active, true)),
    db
      .select({ clientId: clientPlatformAccounts.clientId, platform: clientPlatformAccounts.platform })
      .from(clientPlatformAccounts)
      .where(inArray(clientPlatformAccounts.platform, ["lead_dashboard", "ghl", "openphone"])),
  ]);
  const withSource = new Set(accounts.map((a) => a.clientId));
  return rows
    .filter((c) => !c.archivedAt)
    .map((c) => ({
      clientId: c.id,
      clientName: c.name,
      cadence: (["weekly", "monthly"].includes(c.leadReportCadence) ? c.leadReportCadence : "off") as LeadCadence,
      tone: c.leadReportTone,
      toneNote: c.leadReportToneNote,
      emails: c.leadReportEmails ?? [],
      hasLeadSource: withSource.has(c.id),
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}
