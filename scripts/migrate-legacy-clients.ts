import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { clients, clientPlatformAccounts } from "../src/lib/db/schema";

// One-time import of the client roster that used to live hard-coded in
// src/lib/db/seed.ts (now removed — the settings UI at /settings/clients
// is the source of truth for client/mapping config going forward). Safe to
// run more than once: skips any client whose name already exists.
const LEGACY_CLIENTS = [
  { name: "Acme Roofing", timezone: "America/New_York" },
  { name: "Blue Ridge Dental", timezone: "America/Chicago" },
  { name: "Coastal HVAC", timezone: "America/Los_Angeles" },
  { name: "Desert Legal Group", timezone: "America/Denver" },
  { name: "Evergreen Landscaping", timezone: "America/New_York" },
];

async function main() {
  const db = await getDb();

  for (const legacy of LEGACY_CLIENTS) {
    const [existing] = await db.select().from(clients).where(eq(clients.name, legacy.name)).limit(1);
    if (existing) {
      console.log(`Skipping ${legacy.name} — already present (${existing.id}).`);
      continue;
    }

    const [created] = await db.insert(clients).values(legacy).returning();

    // The old seed script wired every client to a placeholder lead-dashboard
    // account. Preserved here so importing doesn't silently drop it — edit
    // or replace the externalId at /settings/clients/[id] once real IDs are
    // known.
    await db.insert(clientPlatformAccounts).values({
      clientId: created.id,
      platform: "lead_dashboard",
      externalId: `location-${created.id.slice(0, 8)}`,
    });

    console.log(`Imported ${created.name} (${created.id}).`);
  }

  console.log("Legacy client import complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Legacy client import failed:", err);
    process.exit(1);
  });
