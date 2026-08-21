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
    const client = postgres(process.env.DATABASE_URL);
    return drizzle(client, { schema });
  }

  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(process.env.PGLITE_DATA_DIR ?? ".pglite-data");
  return drizzle(client, { schema });
}

let dbPromise: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
}
