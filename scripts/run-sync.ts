import "dotenv/config";
import { runSync } from "../src/lib/sync/run";

runSync()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.status === "failed" ? 1 : 0);
  })
  .catch((err) => {
    console.error("Sync run crashed:", err);
    process.exit(1);
  });
