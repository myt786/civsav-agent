import { eq, and } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getDb } from "../db";
import {
  clients,
  clientPlatformAccounts,
  syncRuns,
  rawResponses,
  metricSnapshots,
} from "../db/schema";
import { connectorRegistry } from "../connectors/registry";
import type { DateRange, PlatformAccount } from "../connectors/types";

export interface SyncError {
  clientId: string;
  platform: string;
  message: string;
}

export interface SyncRunSummary {
  syncRunId: string;
  status: "completed" | "completed_with_errors" | "failed";
  attempted: number;
  errors: SyncError[];
}

// Buckets "yesterday" in the CLIENT's own timezone, never the server's and
// never a platform default — two clients synced in the same run can land
// on different UTC windows for what they each call "yesterday".
function getClientSyncWindow(clientTimezone: string, now: Date): { dateKey: string; range: DateRange } {
  const yesterdayInTz = subDays(toZonedTime(now, clientTimezone), 1);
  const dateKey = format(yesterdayInTz, "yyyy-MM-dd");
  return {
    dateKey,
    range: {
      start: fromZonedTime(`${dateKey}T00:00:00.000`, clientTimezone),
      end: fromZonedTime(`${dateKey}T23:59:59.999`, clientTimezone),
    },
  };
}

export async function runSync(now: Date = new Date()): Promise<SyncRunSummary> {
  const db = await getDb();

  const [syncRun] = await db
    .insert(syncRuns)
    .values({ startedAt: now, status: "running" })
    .returning();

  const errors: SyncError[] = [];
  let attempted = 0;

  const activeClients = await db.select().from(clients).where(eq(clients.active, true));

  for (const client of activeClients) {
    const accounts = await db
      .select()
      .from(clientPlatformAccounts)
      .where(
        and(
          eq(clientPlatformAccounts.clientId, client.id),
          eq(clientPlatformAccounts.active, true),
        ),
      );

    for (const account of accounts) {
      const connector = connectorRegistry[account.platform];
      if (!connector) continue; // platform not built yet — nothing to run

      attempted++;
      const { dateKey, range } = getClientSyncWindow(client.timezone, now);
      const platformAccount: PlatformAccount = {
        clientId: client.id,
        clientTimezone: client.timezone,
        platform: account.platform,
        externalId: account.externalId,
      };

      try {
        const result = await connector.fetch(platformAccount, range);

        // The 'error' variant carries no raw payload by contract (there may
        // be nothing to store — a network failure has no response body).
        // We still persist a record of the run so sync history isn't a gap.
        const rawPayload = result.status === "error" ? { error: result.error } : result.raw;

        await db.insert(rawResponses).values({
          syncRunId: syncRun.id,
          clientId: client.id,
          platform: account.platform,
          payload: rawPayload as object,
          fetchedAt: now,
        });

        if (result.status === "error") {
          errors.push({ clientId: client.id, platform: account.platform, message: result.error });
          continue;
        }

        if (result.status === "no_data") {
          continue; // a real absence of data — not a zero, not written as one
        }

        // Defensive re-validation against the connector's own declared
        // schema before it's trusted into metric_snapshots.
        const validated = connector.schema.safeParse(result.data);
        if (!validated.success) {
          errors.push({
            clientId: client.id,
            platform: account.platform,
            message: `post-fetch schema validation failed: ${validated.error.message}`,
          });
          continue;
        }

        await db
          .insert(metricSnapshots)
          .values({
            clientId: client.id,
            platform: account.platform,
            date: dateKey,
            metrics: validated.data as object,
          })
          .onConflictDoUpdate({
            target: [metricSnapshots.clientId, metricSnapshots.platform, metricSnapshots.date],
            set: { metrics: validated.data as object },
          });
      } catch (err) {
        // A connector must never take the whole run down with it.
        errors.push({
          clientId: client.id,
          platform: account.platform,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const status: SyncRunSummary["status"] =
    errors.length === 0 ? "completed" : errors.length === attempted && attempted > 0 ? "failed" : "completed_with_errors";

  await db
    .update(syncRuns)
    .set({ finishedAt: new Date(), status })
    .where(eq(syncRuns.id, syncRun.id));

  return { syncRunId: syncRun.id, status, attempted, errors };
}
