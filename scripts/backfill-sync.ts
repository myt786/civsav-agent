import "dotenv/config";
import { subDays } from "date-fns";
import { runSync } from "../src/lib/sync/run";

// runSync(now) always targets "yesterday relative to now" per client's own
// timezone (see getClientSyncWindow in src/lib/sync/run.ts) — there is no
// separate backfill code path. Reused here by simply calling it once per
// past day with `now` shifted so that day lands as "yesterday": to target
// N days ago, call runSync with now = today - (N - 1).
//
// Usage: pnpm backfill -- --days=7   (oldest day first, ending at yesterday)
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const days = daysArg ? Number(daysArg.slice("--days=".length)) : NaN;

if (!Number.isInteger(days) || days < 1) {
  console.error("Usage: pnpm backfill -- --days=<N>  (e.g. --days=7)");
  process.exit(1);
}

async function main() {
  const today = new Date();
  console.log(`Backfilling ${days} day(s), oldest first...`);

  for (let n = days; n >= 1; n--) {
    const fakeNow = subDays(today, n - 1);
    const targetDayLabel = subDays(today, n).toISOString().slice(0, 10);
    console.log(`\n[${days - n + 1}/${days}] target ~${targetDayLabel} (per client timezone)...`);
    const summary = await runSync(fakeNow);
    console.log(
      `  status=${summary.status} attempted=${summary.attempted} errors=${summary.errors.length}`,
    );
    for (const err of summary.errors) {
      console.log(`    - ${err.clientId} / ${err.platform}: ${err.message}`);
    }
  }

  console.log("\nBackfill complete.");
}

main().catch((err) => {
  console.error("Backfill crashed:", err);
  process.exit(1);
});
