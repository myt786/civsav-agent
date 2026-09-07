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

export const verificationStatusEnum = pgEnum("verification_status", [
  "ok",
  "no_data",
  "error",
]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  active: boolean("active").notNull().default(true),
});

// Mapping table: one row per (client, platform). All data joins through
// client_id — never through the platform's own external_id.
export const clientPlatformAccounts = pgTable(
  "client_platform_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    platform: platformEnum("platform").notNull(),
    externalId: text("external_id").notNull(),
    // Which of a platform's several credentials this externalId belongs
    // to — null means "the platform's single default credential." Only
    // meaningful for a platform whose API keys are scoped per-tenant
    // rather than shared across every client (OpenPhone: a key is scoped
    // to one workspace, with no cross-workspace agency API). Never a
    // credential itself — just a label naming which env var to read.
    credentialLabel: text("credential_label"),
    active: boolean("active").notNull().default(true),
    // Set by the settings UI's Verify action, which runs the real connector
    // against externalId for a short window. Never written by the sync
    // engine itself — this records "someone confirmed this ID resolves to
    // real data," not "the last sync succeeded." verifiedAt is null until
    // the mapping has been verified at least once, which is what the
    // dashboard uses to render a never-verified mapping's numbers as
    // unverified regardless of the per-day reconciliation flag.
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedStatus: verificationStatusEnum("verified_status"),
    lastError: text("last_error"),
  },
  (table) => [
    // One mapping per (client, platform) — the settings UI upserts on this
    // key, so a second save for the same platform updates the existing row
    // instead of creating a duplicate.
    uniqueIndex("client_platform_accounts_client_platform_idx").on(
      table.clientId,
      table.platform,
    ),
  ],
);

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
    // Whether this row has been checked by hand against the platform's own
    // UI. Set to false on every write (including re-syncs — new numbers are
    // unreconciled again even if the old ones were verified) by sync/run.ts.
    // Nothing in this app flips it to true; that happens outside this
    // read-only tool.
    verified: boolean("verified").notNull().default(false),
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

// One row per edited field, written by every settings mutation (client
// create/update, mapping upsert). Not written for Verify runs — those
// update system-computed state (verifiedAt/verifiedStatus/lastError), not
// a value a person typed in, so they show up as fresh badges rather than
// audit entries. userEmail is self-reported at login, not a verified
// identity — see src/lib/auth.
export const configChanges = pgTable("config_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userEmail: text("user_email").notNull(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  // Null for changes to the client record itself (name/timezone/active);
  // set for changes to one platform mapping.
  platform: platformEnum("platform"),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});
