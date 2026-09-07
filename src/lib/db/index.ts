import * as schema from "./schema";

// DATABASE_URL set -> Neon/Postgres via postgres-js.
// DATABASE_URL unset -> local PGlite (embedded Postgres, file-backed), so
// local dev needs no server install while staying on the same schema
// (jsonb, enums) as production. Never write raw SQL into the jsonb columns
// either way — read and write them whole so the two drivers stay swappable.
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
    const client = postgres(process.env.DATABASE_URL, {
      max: 3,
      idle_timeout: 20,
    });
    return drizzle(client, { schema });
  }

  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(process.env.PGLITE_DATA_DIR ?? ".pglite-data");
  return drizzle(client, { schema });
}

// Next's development compiler can reload this module while another route
// still holds the embedded database. Keep one connection across those
// bundles; opening PGlite twice on the same directory can stall requests.
const databaseGlobal = globalThis as typeof globalThis & {
  __civsavDatabase?: ReturnType<typeof createDb>;
};

export function getDb() {
  if (!databaseGlobal.__civsavDatabase) {
    databaseGlobal.__civsavDatabase = createDb().catch((error) => {
      databaseGlobal.__civsavDatabase = undefined;
      throw error;
    });
  }
  return databaseGlobal.__civsavDatabase;
}
