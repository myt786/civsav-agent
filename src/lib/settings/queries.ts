import "server-only";
import { and, eq, ilike, sql } from "drizzle-orm";
import {
  PAGE_SIZE,
  pageNumber,
  param,
  type SearchParams,
} from "../dashboard/portfolio";
import { getDb } from "../db";
import { clientPlatformAccounts, clients } from "../db/schema";
import type { Platform } from "../connectors/types";

export async function listClients() {
  const db = await getDb();
  return db.select().from(clients).orderBy(clients.name);
}

export async function getClientsDirectory(params: SearchParams) {
  const db = await getDb();
  const q = param(params, "q")
    .trim()
    .replace(/[\\%_]/g, "\\$&");
  const status = param(params, "status");
  const where = and(
    q ? ilike(clients.name, `%${q}%`) : undefined,
    status === "active"
      ? eq(clients.active, true)
      : status === "inactive"
        ? eq(clients.active, false)
        : undefined,
  );
  const [count] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(clients)
    .where(where);
  const total = Number(count.value);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageNumber(params), pages);
  const items = await db
    .select()
    .from(clients)
    .where(where)
    .orderBy(clients.name, clients.id)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { items, total, pages, page, pageSize: PAGE_SIZE };
}

export async function getClient(clientId: string) {
  const db = await getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return client ?? null;
}

export async function getClientMappings(clientId: string) {
  const db = await getDb();
  return db
    .select()
    .from(clientPlatformAccounts)
    .where(eq(clientPlatformAccounts.clientId, clientId));
}

export async function getMapping(clientId: string, platform: Platform) {
  const db = await getDb();
  const [mapping] = await db
    .select()
    .from(clientPlatformAccounts)
    .where(
      and(
        eq(clientPlatformAccounts.clientId, clientId),
        eq(clientPlatformAccounts.platform, platform),
      ),
    )
    .limit(1);
  return mapping ?? null;
}
