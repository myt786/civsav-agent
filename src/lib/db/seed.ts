import "dotenv/config";
import { getDb } from "./index";
import { clients, clientPlatformAccounts } from "./schema";

const TEST_CLIENTS = [
  { name: "Acme Roofing", timezone: "America/New_York" },
  { name: "Blue Ridge Dental", timezone: "America/Chicago" },
  { name: "Coastal HVAC", timezone: "America/Los_Angeles" },
  { name: "Desert Legal Group", timezone: "America/Denver" },
  { name: "Evergreen Landscaping", timezone: "America/New_York" },
];

async function seed() {
  const db = await getDb();

  for (const client of TEST_CLIENTS) {
    const [inserted] = await db.insert(clients).values(client).returning();

    await db.insert(clientPlatformAccounts).values([
      {
        clientId: inserted.id,
        platform: "lead_dashboard",
        externalId: `location-${inserted.id.slice(0, 8)}`,
      },
    ]);

    console.log(`Seeded ${inserted.name} (${inserted.id})`);
  }
}

seed()
  .then(() => {
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
