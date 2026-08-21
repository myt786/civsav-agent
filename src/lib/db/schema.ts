import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Frozen once connectors are being built against it — adding a platform later
// is additive (new enum value), never a rename or removal.
export const platformEnum = pgEnum("platform", [
  "google_ads",
  "meta",
  "ga4",
  "search_console",
  "ghl",
  "openphone",
  "ahrefs",
  "lead_dashboard",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "running",
  "completed",
  "completed_with_errors",
  "failed",
]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  active: boolean("active").notNull().default(true),
});

// Mapping table: one row per (client, platform). All data joins through
// client_id — never through the platform's own external_id.
export const clientPlatformAccounts = pgTable("client_platform_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  platform: platformEnum("platform").notNull(),
  externalId: text("external_id").notNull(),
  active: boolean("active").notNull().default(true),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: syncStatusEnum("status").notNull().default("running"),
});

// Full untouched API response, every run. History cannot be backfilled
// later, so this is stored even when the fetch resulted in an error.
export const rawResponses = pgTable("raw_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  syncRunId: uuid("sync_run_id")
    .notNull()
    .references(() => syncRuns.id),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  platform: platformEnum("platform").notNull(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

// Normalized values for display. Only written on a successful fetch.
export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    platform: platformEnum("platform").notNull(),
    date: date("date").notNull(),
    metrics: jsonb("metrics").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_snapshots_client_platform_date_idx").on(
      table.clientId,
      table.platform,
      table.date,
    ),
  ],
);
