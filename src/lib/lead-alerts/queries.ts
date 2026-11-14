import "server-only";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { subDays } from "date-fns";
import { getDb } from "../db";
import { clients, leadAlerts } from "../db/schema";
import type { LeadAlertKind, LeadAlertSeverity, LeadFinding } from "./detect";

export interface LeadAlertRow {
  id: string;
  clientId: string;
  clientName: string;
  owner: string | null;
  kind: LeadAlertKind;
  source: string;
  severity: LeadAlertSeverity;
  status: "open" | "acknowledged" | "resolved";
  message: string;
  detail: LeadFinding["detail"];
  openedAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  note: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  snoozedUntil: string | null;
}

// Open and acknowledged alerts, plus those resolved in the last week.
export async function listLeadAlerts(now: Date = new Date()): Promise<LeadAlertRow[]> {
  const db = await getDb();
  const [active, recent] = await Promise.all([
    db.select().from(leadAlerts).where(inArray(leadAlerts.status, ["open", "acknowledged"])).orderBy(desc(leadAlerts.openedAt)),
    db
      .select()
      .from(leadAlerts)
      .where(and(eq(leadAlerts.status, "resolved"), gte(leadAlerts.resolvedAt, subDays(now, 7))))
      .orderBy(desc(leadAlerts.resolvedAt))
      .limit(30),
  ]);
  const rows = [...active, ...recent];
  const ids = [...new Set(rows.map((r) => r.clientId))];
  const info = ids.length
    ? await db.select({ id: clients.id, name: clients.name, owner: clients.leadAlertOwner }).from(clients).where(inArray(clients.id, ids))
    : [];
  const byId = new Map(info.map((c) => [c.id, c]));
  return rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: byId.get(r.clientId)?.name ?? "Unknown client",
    owner: byId.get(r.clientId)?.owner ?? null,
    kind: r.kind as LeadAlertKind,
    source: r.source,
    severity: r.severity as LeadAlertSeverity,
    status: r.status as LeadAlertRow["status"],
    message: r.message,
    detail: (r.detail ?? {}) as LeadFinding["detail"],
    openedAt: r.openedAt.toISOString(),
    acknowledgedBy: r.acknowledgedBy,
    acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
    note: r.note,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    resolvedBy: r.resolvedBy,
    snoozedUntil: r.snoozedUntil && r.snoozedUntil.getTime() > now.getTime() ? r.snoozedUntil.toISOString() : null,
  }));
}

// For the attention flags: one entry per open or acknowledged alert that
// isn't snoozed.
export async function listActiveLeadAlertFlags(): Promise<{ clientId: string; clientName: string; message: string; severity: LeadAlertSeverity }[]> {
  const rows = await listLeadAlerts();
  return rows
    .filter((r) => r.status !== "resolved" && !r.snoozedUntil)
    .map((r) => ({ clientId: r.clientId, clientName: r.clientName, message: r.message, severity: r.severity }));
}
