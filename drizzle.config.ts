import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default databaseUrl
  ? defineConfig({
      out: "./drizzle",
      schema: "./src/lib/db/schema.ts",
      dialect: "postgresql",
      dbCredentials: { url: databaseUrl },
    })
  : defineConfig({
      out: "./drizzle",
      schema: "./src/lib/db/schema.ts",
      dialect: "postgresql",
      driver: "pglite",
      dbCredentials: { url: process.env.PGLITE_DATA_DIR ?? ".pglite-data" },
    });
