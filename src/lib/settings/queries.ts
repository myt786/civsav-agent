import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { clientPlatformAccounts, clients } from "../db/schema";
import type { Platform } from "../connectors/types";

export async function listClients() {
  const db = await getDb();
  return db.select().from(clients).orderBy(clients.name);
}

export async function getClient(clientId: string) {
  const db = await getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  return client ?? null;
}

export async function getClientMappings(clientId: string) {
  const db = await getDb();
  return db.select().from(clientPlatformAccounts).where(eq(clientPlatformAccounts.clientId, clientId));
}

export async function getMapping(clientId: string, platform: Platform) {
  const db = await getDb();
  const [mapping] = await db
    .select()
    .from(clientPlatformAccounts)
    .where(and(eq(clientPlatformAccounts.clientId, clientId), eq(clientPlatformAccounts.platform, platform)))
    .limit(1);
  return mapping ?? null;
}
