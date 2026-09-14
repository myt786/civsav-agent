// Plain `dotenv/config` only loads `.env` — never `.env.local`, which is
// the only env file this repo actually has (the Next.js convention: real
// secrets go in .env.local, which is gitignored; .env, if present, holds
// shared non-secret defaults). Every script/config here used to import
// "dotenv/config" directly and silently got DATABASE_URL undefined,
// making getDb() fall through to the local PGlite file instead of the
// real database — same precedence Next.js itself uses (.env.local wins).
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });
