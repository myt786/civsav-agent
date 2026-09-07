import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { configChanges } from "../db/schema";
import type { Platform } from "../connectors/types";

interface ChangeInput {
  userEmail: string;
  clientId: string;
  platform?: Platform;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

// Only writes a row when the value actually changed — saving a form with
// nothing edited shouldn't pad the audit trail with no-op entries.
export async function logChange(db: Awaited<ReturnType<typeof getDb>>, change: ChangeInput): Promise<void> {
  if (change.oldValue === change.newValue) return;
  await db.insert(configChanges).values({
    userEmail: change.userEmail,
    clientId: change.clientId,
    platform: change.platform,
    field: change.field,
    oldValue: change.oldValue,
    newValue: change.newValue,
  });
}

export async function logChanges(db: Awaited<ReturnType<typeof getDb>>, changes: ChangeInput[]): Promise<void> {
  for (const change of changes) {
    await logChange(db, change);
  }
}

export async function getRecentChanges(clientId: string, limit = 25) {
  const db = await getDb();
  return db
    .select()
    .from(configChanges)
    .where(eq(configChanges.clientId, clientId))
    .orderBy(desc(configChanges.changedAt))
    .limit(limit);
}
