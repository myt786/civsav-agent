import { eq, and, lt } from "drizzle-orm";
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
import type { DateRange, Platform, PlatformAccount } from "../connectors/types";

export interface RunSyncOptions {
  // Restricts the run to ONLY these platforms — used by
  // /api/cron/sync-monthly to give a metered connector (ahrefs) its own
  // cadence.
  platforms?: Platform[];
  // Restricts the run to every platform EXCEPT these — used by the daily
  // /api/cron/sync so it doesn't also re-sync a platform that has its own
  // separate cadence. platforms and excludePlatforms are mutually
  // exclusive; if both are somehow set, platforms wins.
  excludePlatforms?: Platform[];
}

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

// Platforms that publish a day's numbers late. Asking them for "yesterday"
// returns nothing, and the sync never goes back, so their days stayed empty
// for good — Search Console publishes 2-3 days behind, which left it weeks
// out of date. These platforms are asked for an older, finished day.
const DATA_LAG_DAYS: Partial<Record<Platform, number>> = {
  search_console: 2,
};

// Buckets "yesterday" (minus any platform lag) in the CLIENT's own
// timezone, never the server's and never a platform default — two clients
// synced in the same run can land on different UTC windows for what they
// each call "yesterday".
function getClientSyncWindow(
  clientTimezone: string,
  now: Date,
  lagDays = 0,
): { dateKey: string; range: DateRange } {
  const yesterdayInTz = subDays(toZonedTime(now, clientTimezone), 1 + lagDays);
  const dateKey = format(yesterdayInTz, "yyyy-MM-dd");
  return {
    dateKey,
    range: {
      start: fromZonedTime(`${dateKey}T00:00:00.000`, clientTimezone),
      end: fromZonedTime(`${dateKey}T23:59:59.999`, clientTimezone),
    },
  };
}

// How many accounts are fetched at once. Each platform's own rate limiter
// still spaces its calls; this just stops one slow platform (or one slow
// client) from holding up every other account behind it.
const CONCURRENCY = 6;

// Vercel stops the cron function at 300s (maxDuration). Past this point no
// new fetch is started; the rest are recorded as skipped errors so they
// show up on the dashboard instead of the run silently stopping halfway.
const TIME_BUDGET_MS = 250_000;

// A run still "running" after this long was cut off before it could finish
// (timeout, crash, deploy) and will never update itself.
const STUCK_RUN_MS = 15 * 60 * 1000;

interface WorkItem {
  client: typeof clients.$inferSelect;
  account: typeof clientPlatformAccounts.$inferSelect;
}

export async function runSync(now: Date = new Date(), options: RunSyncOptions = {}): Promise<SyncRunSummary> {
  const platformFilter = options.platforms ? new Set(options.platforms) : null;
  const excludeFilter = !platformFilter && options.excludePlatforms ? new Set(options.excludePlatforms) : null;
  const db = await getDb();
  const startedAtMs = Date.now();

  // Earlier runs that were cut off would otherwise show "running" forever.
  await db
    .update(syncRuns)
    .set({ status: "failed", finishedAt: new Date() })
    .where(and(eq(syncRuns.status, "running"), lt(syncRuns.startedAt, new Date(startedAtMs - STUCK_RUN_MS))));

  // Real wall-clock time, not `now`: a backfill passes a past `now` to pick
  // which day to fetch, but the run itself is happening today.
  const [syncRun] = await db
    .insert(syncRuns)
    .values({ startedAt: new Date(startedAtMs), status: "running" })
    .returning();

  const errors: SyncError[] = [];

  const activeClients = await db.select().from(clients).where(eq(clients.active, true));
  const activeAccounts = await db.select().from(clientPlatformAccounts).where(eq(clientPlatformAccounts.active, true));
  const clientById = new Map(activeClients.map((client) => [client.id, client]));

  const work: WorkItem[] = [];
  for (const account of activeAccounts) {
    const client = clientById.get(account.clientId);
    if (!client) continue;
    if (platformFilter && !platformFilter.has(account.platform)) continue;
    if (excludeFilter && excludeFilter.has(account.platform)) continue;
    if (!connectorRegistry[account.platform]) continue; // platform not built yet — nothing to run
    work.push({ client, account });
  }
  const attempted = work.length;

  // Every failure gets an error row in raw_responses: the dashboard's error
  // cells and the per-platform error counts are read from there, so a
  // failure recorded only in this run's summary would be invisible.
  async function recordError(item: WorkItem, message: string) {
    errors.push({ clientId: item.client.id, platform: item.account.platform, message });
    try {
      await db.insert(rawResponses).values({
        syncRunId: syncRun.id,
        clientId: item.client.id,
        platform: item.account.platform,
        payload: { error: message },
        fetchedAt: new Date(),
      });
    } catch {
      // Recording the error must not take the run down either.
    }
  }

  async function syncOne(item: WorkItem) {
    const { client, account } = item;
    const connector = connectorRegistry[account.platform]!;
    const { dateKey, range } = getClientSyncWindow(client.timezone, now, DATA_LAG_DAYS[account.platform] ?? 0);
    const platformAccount: PlatformAccount = {
      clientId: client.id,
      clientTimezone: client.timezone,
      platform: account.platform,
      externalId: account.externalId,
      credentialLabel: account.credentialLabel,
    };

    try {
      const result = await connector.fetch(platformAccount, range);

      if (result.status === "error") {
        await recordError(item, result.error);
        return;
      }

      await db.insert(rawResponses).values({
        syncRunId: syncRun.id,
        clientId: client.id,
        platform: account.platform,
        payload: result.raw as object,
        fetchedAt: new Date(),
      });

      if (result.status === "no_data") {
        return; // a real absence of data — not a zero, not written as one
      }

      // Defensive re-validation against the connector's own declared
      // schema before it's trusted into metric_snapshots.
      const validated = connector.schema.safeParse(result.data);
      if (!validated.success) {
        await recordError(item, `post-fetch schema validation failed: ${validated.error.message}`);
        return;
      }

      await db
        .insert(metricSnapshots)
        .values({
          clientId: client.id,
          platform: account.platform,
          date: dateKey,
          metrics: validated.data as object,
          verified: false,
        })
        .onConflictDoUpdate({
          target: [metricSnapshots.clientId, metricSnapshots.platform, metricSnapshots.date],
          // A re-synced day is unreconciled again even if the old numbers
          // it's replacing had been checked by hand — verification never
          // carries forward onto new data.
          set: { metrics: validated.data as object, verified: false },
        });
    } catch (err) {
      // A connector must never take the whole run down with it.
      await recordError(item, err instanceof Error ? err.message : String(err));
    }
  }

  let next = 0;
  async function worker() {
    while (next < work.length) {
      const item = work[next++];
      if (Date.now() - startedAtMs > TIME_BUDGET_MS) {
        await recordError(item, "Skipped: the update ran out of time before reaching this account. It will be tried again on the next update.");
        continue;
      }
      await syncOne(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, () => worker()));

  const status: SyncRunSummary["status"] =
    errors.length === 0 ? "completed" : errors.length === attempted && attempted > 0 ? "failed" : "completed_with_errors";

  await db
    .update(syncRuns)
    .set({ finishedAt: new Date(), status })
    .where(eq(syncRuns.id, syncRun.id));

  return { syncRunId: syncRun.id, status, attempted, errors };
}
