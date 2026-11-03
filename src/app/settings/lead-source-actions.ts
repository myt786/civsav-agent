"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { logChange } from "@/lib/settings/audit";
import { isUuid } from "@/lib/settings/validation";
import { isLeadSource, leadSourceInfo } from "@/lib/leads/sources";

// A client page's "Counts towards leads" switch: include or leave out one
// lead source from this client's total leads (dashboard, Insights, emails
// and AI analysis all follow it).
export async function setLeadSourceCounted(clientId: string, source: string, counted: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!isUuid(clientId) || !isLeadSource(source)) return { error: "That lead source wasn't found." };

  const db = await getDb();
  const rows = await db.select({ off: clients.leadSourcesOff }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!rows[0]) return { error: "That client wasn't found." };

  const before = (rows[0].off ?? []).filter(isLeadSource);
  const after = counted ? before.filter((s) => s !== source) : [...new Set([...before, source])];
  await db.update(clients).set({ leadSourcesOff: after }).where(eq(clients.id, clientId));
  await logChange(db, {
    userEmail: session.email,
    clientId,
    platform: leadSourceInfo(source).platform,
    field: "counts_as_leads",
    oldValue: String(!before.includes(source)),
    newValue: String(counted),
  });

  revalidatePath(`/settings/clients/${clientId}`);
  revalidatePath("/");
  revalidatePath("/insights");
  return {};
}
