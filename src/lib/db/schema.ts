import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  jsonb,
  integer,
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
  // Set when a client is archived: hidden from Settings by default, and —
  // since archiving also sets active = false — left out of the dashboard,
  // SEO, Insights, the daily/monthly syncs and every other active-only
  // query. Null for live (active or merely paused) clients.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
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

// API keys pasted in Settings → API keys, for platforms whose keys are
// per-tenant rather than one shared credential (GHL: one key per
// sub-account; OpenPhone: one key per workspace). Replaces the old
// one-env-var-per-key setup, which needed a Vercel edit and a redeploy for
// every new client. A mapping points at one of these through
// credentialLabel = "db:<id>" (see connectors/stored-credentials.ts);
// env-var labels keep working alongside.
export const platformCredentials = pgTable(
  "platform_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: platformEnum("platform").notNull(),
    // Shown in the account picker — usually the client's name for GHL, or
    // the workspace's name for OpenPhone.
    name: text("name").notNull(),
    // GHL only: the location (sub-account) this key was created inside.
    // Stored with the key so the location shows up in discovery by name,
    // instead of someone typing the ID on every client that uses it.
    externalId: text("external_id"),
    // AES-256-GCM, keyed by CREDENTIALS_ENCRYPTION_KEY. Never sent to the
    // browser.
    secretEncrypted: text("secret_encrypted").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("platform_credentials_platform_name_idx").on(table.platform, table.name)],
);

// Who gets the emailed reports (Settings → Email reports), and which ones.
// Sent through Resend — see src/lib/email.
export const reportRecipients = pgTable(
  "report_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    dailySummary: boolean("daily_summary").notNull().default(true),
    monthlySeo: boolean("monthly_seo").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("report_recipients_email_idx").on(table.email)],
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

// Editorial fields for the /seo dashboard — SEO Owner, Status, and Notes
// are human-entered per client per calendar month, not derived from any
// connector. One row per (client, month): the current month's row is
// editable from the dashboard, and "Prev. Month Summary" is simply last
// month's row for that client read directly — no copy-forward step
// needed, unlike the Excel pipeline this replaces.
export const clientSeoMonthly = pgTable(
  "client_seo_monthly",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    month: text("month").notNull(), // "YYYY-MM"
    seoOwner: text("seo_owner"),
    status: text("status"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("client_seo_monthly_client_month_idx").on(table.clientId, table.month),
  ],
);

// AI-generated "what to do next" per client for the /seo dashboard's
// Recommendations tab — latest only (not monthly, unlike
// client_seo_monthly), since a recommendation is a current snapshot to
// act on, not an editorial archive. Regenerating overwrites the row.
export const clientSeoRecommendations = pgTable("client_seo_recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id)
    .unique(),
  recommendations: jsonb("recommendations").notNull(), // string[]
  // How much sitemap context fed this generation, surfaced in the UI so
  // "no sitemap found" isn't silently indistinguishable from "300 pages
  // considered" — both are legitimate, but very different confidence.
  sitemapUrlCount: integer("sitemap_url_count"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
