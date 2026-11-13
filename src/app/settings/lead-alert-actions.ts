"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db";
import { clients, leadAlerts, teamMembers } from "@/lib/db/schema";
import { isUuid } from "@/lib/settings/validation";
import { isSensitivity } from "@/lib/lead-alerts/detect";

function refresh(clientId?: string) {
  revalidatePath("/insights");
  revalidatePath("/");
  if (clientId) revalidatePath(`/settings/clients/${clientId}`);
}

// "I'm on it": stops the 48-hour reminders; the note tells the team what's
// being done.
export async function acknowledgeLeadAlert(id: string, note: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isUuid(id)) return { error: "That alert wasn't found." };
  const db = await getDb();
  const [row] = await db.select({ status: leadAlerts.status }).from(leadAlerts).where(eq(leadAlerts.id, id)).limit(1);
  if (!row) return { error: "That alert wasn't found." };
  if (row.status === "resolved") return { error: "This alert is already resolved." };
  await db
    .update(leadAlerts)
    .set({ status: "acknowledged", acknowledgedBy: session.email, acknowledgedAt: new Date(), note: note?.trim().slice(0, 1000) || null, updatedAt: new Date() })
    .where(eq(leadAlerts.id, id));
  refresh();
  return {};
}

// Close it by hand (e.g. the client paused their ads on purpose). If the
// problem is still there at the next check, a new alert opens.
export async function resolveLeadAlert(id: string, note: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isUuid(id)) return { error: "That alert wasn't found." };
  const db = await getDb();
  const now = new Date();
  await db
    .update(leadAlerts)
    .set({ status: "resolved", resolvedAt: now, resolvedBy: session.email, note: note?.trim().slice(0, 1000) || null, updatedAt: now })
    .where(eq(leadAlerts.id, id));
  refresh();
  return {};
}

export async function saveLeadAlertSettings(input: {
  clientId: string;
  owner: string;
  sensitivity: string;
  paused: boolean;
}): Promise<{ error?: string }> {
  await requireSession();
  if (!isUuid(input.clientId)) return { error: "That client wasn't found." };
  if (!isSensitivity(input.sensitivity)) return { error: "Pick a sensitivity." };
  const db = await getDb();
  const owner = input.owner?.trim().toLowerCase() || null;
  if (owner) {
    const [member] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, owner)).limit(1);
    if (!member) return { error: "Pick someone from Settings → Team." };
  }
  await db
    .update(clients)
    .set({ leadAlertOwner: owner, leadAlertSensitivity: input.sensitivity, leadAlertsPaused: Boolean(input.paused) })
    .where(eq(clients.id, input.clientId));
  refresh(input.clientId);
  return {};
}
