import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { clientPlatformAccounts, clients, metricSnapshots } from "../db/schema";
import type { Platform } from "../connectors/types";

export async function listClients() {
  const db = await getDb();
  return db.select().from(clients).orderBy(clients.name);
}

export interface ClientAccountSummary {
  platform: Platform;
  active: boolean;
  verifiedAt: Date | null;
  verifiedStatus: "ok" | "no_data" | "error" | null;
  lastError: string | null;
}

export interface ClientWithAccounts {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  accounts: ClientAccountSummary[];
  // When this client's numbers last arrived from any platform (null if
  // never).
  lastUpdatedAt: Date | null;
}

// The Settings client list: every client plus the status of each connected
// account, so the list can show per-row account badges and filter by them.
export async function listClientsWithAccounts(): Promise<ClientWithAccounts[]> {
  const db = await getDb();
  const [clientRows, mappingRows, lastUpdateRows] = await Promise.all([
    db.select().from(clients).orderBy(clients.name),
    db
      .select({
        clientId: clientPlatformAccounts.clientId,
        platform: clientPlatformAccounts.platform,
        active: clientPlatformAccounts.active,
        verifiedAt: clientPlatformAccounts.verifiedAt,
        verifiedStatus: clientPlatformAccounts.verifiedStatus,
        lastError: clientPlatformAccounts.lastError,
      })
      .from(clientPlatformAccounts),
    db
      .select({
        clientId: metricSnapshots.clientId,
        last: sql<string | null>`max(${metricSnapshots.createdAt})`,
      })
      .from(metricSnapshots)
      .groupBy(metricSnapshots.clientId),
  ]);
  const lastUpdateByClient = new Map(lastUpdateRows.map((row) => [row.clientId, row.last]));

  const byClient = new Map<string, ClientAccountSummary[]>();
  for (const { clientId, ...account } of mappingRows) {
    const list = byClient.get(clientId) ?? [];
    list.push(account);
    byClient.set(clientId, list);
  }

  return clientRows.map((client) => ({
    id: client.id,
    name: client.name,
    timezone: client.timezone,
    active: client.active,
    accounts: byClient.get(client.id) ?? [],
    lastUpdatedAt: lastUpdateByClient.get(client.id) ? new Date(lastUpdateByClient.get(client.id)!) : null,
  }));
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
