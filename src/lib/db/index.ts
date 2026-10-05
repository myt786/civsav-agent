import * as schema from "./schema";

// DATABASE_URL set -> Neon/Postgres via postgres-js.
// DATABASE_URL unset -> local PGlite (embedded Postgres, file-backed), so
// local dev needs no server install while staying on the same schema
// (jsonb, enums) as production. Never write raw SQL into the jsonb columns
// either way — read and write them whole so the two drivers stay swappable.
// Columns added after launch. Migrations here are run by hand, so the app
// adds them itself on first connection (idempotent) — otherwise every query
// that selects them would fail until someone ran db:migrate. Matching
// migration files exist in drizzle/ so drizzle-kit stays in step. Errors are
// ignored: on a database without these tables yet, the migrations create
// them.
const SELF_HEALING_DDL = [
  `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone`,
  `CREATE TABLE IF NOT EXISTS "report_recipients" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "email" text NOT NULL,
    "daily_summary" boolean DEFAULT true NOT NULL,
    "monthly_seo" boolean DEFAULT true NOT NULL,
    "created_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "report_recipients_email_idx" ON "report_recipients" USING btree ("email")`,
  `ALTER TABLE "report_recipients" ADD COLUMN IF NOT EXISTS "access_report" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "excluded_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL`,
  `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "show_on_dashboard" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "show_on_seo" boolean DEFAULT true NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "team_members" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "email" text NOT NULL,
    "password_hash" text NOT NULL,
    "password_set_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_login_at" timestamp with time zone,
    "created_by" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "team_members_email_idx" ON "team_members" USING btree ("email")`,
];

async function createDb() {
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    // Serverless-appropriate pool size: postgres-js defaults to up to 10
    // connections per instantiation, and nothing else here ever closes
    // them. Under real traffic, every concurrent Vercel function instance
    // opening its own 10-connection pool exhausts a small managed
    // Postgres' connection ceiling fast — confirmed live (DigitalOcean
    // refused new connections entirely: "remaining connection slots are
    // reserved for roles with the SUPERUSER attribute"). idle_timeout
    // releases a connection back once this instance goes quiet.
    const client = postgres(process.env.DATABASE_URL, { max: 3, idle_timeout: 20 });
    // One at a time, so one statement failing doesn't skip the rest.
    for (const statement of SELF_HEALING_DDL) await client.unsafe(statement).catch(() => {});
    return drizzle(client, { schema });
  }

  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(process.env.PGLITE_DATA_DIR ?? ".pglite-data");
  for (const statement of SELF_HEALING_DDL) await client.exec(statement).catch(() => {});
  return drizzle(client, { schema });
}

let dbPromise: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
}
