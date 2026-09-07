import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { getDashboardData } from "./queries";
import { getClientPage } from "./views";
import { getClientsDirectory } from "../settings/queries";
import { runSync } from "../sync/run";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ getDb: () => Promise.resolve(database) }));
vi.mock("../connectors/registry", async () => {
  const { leadDashboardDataSchema } =
    await import("../connectors/lead-dashboard/schema");
  return {
    connectorRegistry: {
      lead_dashboard: {
        schema: leadDashboardDataSchema,
        fetch: async () => ({
          status: "ok",
          raw: {},
          data: {
            totalLeads: 0,
            byStatus: { completed: 0, abandoned: 0 },
            spamLeads: 0,
            rangeStart: "2026-09-06",
            rangeEnd: "2026-09-06",
          },
        }),
      },
    },
  };
});
const pg = new PGlite();
const database = drizzle(pg, { schema });
const now = new Date("2026-09-07T12:00:00Z");
beforeAll(async () => {
  await migrate(database, { migrationsFolder: "./drizzle" });
}, 30000);
afterAll(async () => {
  await pg.close();
});

describe("dashboard database queries", () => {
  it("keeps invalid spend history as a gap instead of charting a false zero", async () => {
    const [client] = await database
      .insert(schema.clients)
      .values({ name: "Invalid spend", timezone: "UTC" })
      .returning();
    await database
      .insert(schema.metricSnapshots)
      .values({
        clientId: client.id,
        platform: "google_ads",
        date: "2026-09-06",
        metrics: { cost: "invalid" },
      });
    const data = await getDashboardData(now, client.id);
    expect(data.rows[0].spend.kind).toBe("error");
    expect(
      data.details[client.id].sparklines
        .find((s) => s.key === "spend")!
        .points.at(-1)?.value,
    ).toBeNull();
  });
  it("advances successful freshness when an existing day is re-synced", async () => {
    const [client] = await database
      .insert(schema.clients)
      .values({ name: "Re-sync test", timezone: "UTC" })
      .returning();
    await database.insert(schema.clientPlatformAccounts).values({
      clientId: client.id,
      platform: "lead_dashboard",
      externalId: "test-account",
    });
    await database.insert(schema.metricSnapshots).values({
      clientId: client.id,
      platform: "lead_dashboard",
      date: "2026-09-06",
      metrics: {},
      verified: true,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    });
    const before = Date.now();
    const result = await runSync(now);
    expect(result.status).toBe("completed");
    const refreshed = await getDashboardData(now, client.id);
    expect(refreshed.rows[0].lastSyncedAt!.getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(refreshed.rows[0].leads).toEqual({ kind: "unverified", value: 0 });
  });
  it("separates a failed recent attempt from an older successful sync", async () => {
    const [client] = await database
      .insert(schema.clients)
      .values({ name: "Freshness test", timezone: "UTC" })
      .returning();
    const successAt = new Date("2026-09-05T10:00:00Z");
    const [run] = await database
      .insert(schema.syncRuns)
      .values({ startedAt: now, status: "failed" })
      .returning();
    await database.insert(schema.metricSnapshots).values({
      clientId: client.id,
      platform: "lead_dashboard",
      date: "2026-09-06",
      metrics: {
        totalLeads: 0,
        byStatus: { completed: 0, abandoned: 0 },
        spamLeads: 0,
        rangeStart: "2026-09-06",
        rangeEnd: "2026-09-06",
      },
      createdAt: successAt,
      verified: true,
    });
    await database.insert(schema.rawResponses).values({
      clientId: client.id,
      platform: "lead_dashboard",
      syncRunId: run.id,
      payload: { error: "Access expired" },
      fetchedAt: now,
    });
    const data = await getDashboardData(now, client.id);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].lastSyncedAt).toEqual(successAt);
    expect(data.rows[0].lastAttemptAt).toEqual(now);
    expect(data.rows[0].staleHours).toBe(50);
    expect(data.rows[0].leads).toEqual({ kind: "unverified", value: 0 });
  });
  it("retains latest errors even outside the chart window and has no false successful timestamp", async () => {
    const [client] = await database
      .insert(schema.clients)
      .values({ name: "Never synced", timezone: "UTC" })
      .returning();
    const old = new Date("2026-01-01T00:00:00Z");
    const [run] = await database
      .insert(schema.syncRuns)
      .values({ startedAt: old, status: "failed" })
      .returning();
    await database.insert(schema.rawResponses).values({
      clientId: client.id,
      platform: "lead_dashboard",
      syncRunId: run.id,
      payload: { error: "Invalid account" },
      fetchedAt: old,
    });
    const page = await getClientPage(client.id, now);
    expect(page?.row.lastSyncedAt).toBeNull();
    expect(page?.row.lastAttemptAt).toEqual(old);
    expect(page?.row.leads).toEqual({
      kind: "error",
      message: "Invalid account",
    });
    expect(page?.health).toBe("critical");
  });
  it("returns no client for invalid, unknown and inactive IDs", async () => {
    expect(await getClientPage("not-a-uuid", now)).toBeNull();
    expect(
      await getClientPage("00000000-0000-0000-0000-000000000000", now),
    ).toBeNull();
    const [client] = await database
      .insert(schema.clients)
      .values({ name: "Inactive", timezone: "UTC", active: false })
      .returning();
    expect(await getClientPage(client.id, now)).toBeNull();
  });
  it("filters and paginates a directory of more than 150 clients in the database", async () => {
    await database.insert(schema.clients).values(
      Array.from({ length: 155 }, (_, i) => ({
        name: `Directory ${String(i).padStart(3, "0")}`,
        timezone: "UTC",
        active: i !== 154,
      })),
    );
    const second = await getClientsDirectory({
      q: "Directory",
      status: "active",
      page: "2",
    });
    expect(second.total).toBe(154);
    expect(second.items).toHaveLength(25);
    expect(second.items[0].name).toBe("Directory 025");
    expect(
      (
        await getClientsDirectory({ q: "Directory", status: "inactive" })
      ).items.map((c) => c.name),
    ).toEqual(["Directory 154"]);
    expect((await getClientsDirectory({ q: "%" })).total).toBe(0);
  });
});
