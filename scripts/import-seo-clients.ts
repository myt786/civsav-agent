import "./env";
import { readFileSync } from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { clients, clientPlatformAccounts } from "../src/lib/db/schema";

// One-time import/merge of the real SEO client roster that has lived in
// seo-ai-tool/clients.json (a separate, standalone Python pipeline being
// folded into this app as the /seo dashboard).
//
// This is NOT a blind insert: akagent's `clients` table already has real,
// fully-provisioned clients (real GA4/GHL/Ads IDs) whose display names
// don't match clients.json's (e.g. "2M Machinery, LLC" vs
// "2mmachinery.com"). Matching is by DOMAIN — derived from each existing
// client's `ahrefs`/`search_console` mapping, normalized (strip
// protocol/www/sc-domain:/trailing slash) — never by name.
//
// For a domain that matches an existing client: only ADD the
// search_console/ahrefs mapping if that client doesn't already have one
// for that platform. An existing mapping is never overwritten — it may
// have been hand-corrected since clients.json was last touched, and
// clients.json is not assumed to be more authoritative than a mapping a
// human already configured in this app.
//
// For a domain with no existing client at all: create a new client (GA4
// deliberately not wired — no client has a ga4_property_id set in
// clients.json yet).
//
// Safe to run more than once: matched clients are only ever filled in,
// never duplicated; a domain already fully covered is a no-op.

interface LegacySeoClient {
  name: string;
  domain: string;
  gsc_property?: string;
  status: "active" | "inactive" | "excluded";
}

function loadLegacyClients(): LegacySeoClient[] {
  const filePath = path.join(__dirname, "..", "seo-ai-tool", "clients.json");
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as { clients: LegacySeoClient[] };
  return parsed.clients;
}

// Collapses every externalId shape this app + clients.json actually use
// for a domain identifier down to one comparable key:
//   "sc-domain:example.com"        -> "example.com"
//   "https://www.example.com/"     -> "example.com"
//   "example.com"                  -> "example.com"
function normalizeDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^sc-domain:/, "");
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\/+$/, "");
  return s;
}

async function main() {
  const db = await getDb();
  const legacyClients = loadLegacyClients();

  const existingClients = await db.select().from(clients);
  const existingAccounts = await db.select().from(clientPlatformAccounts);

  // Prefer ahrefs' externalId as the domain signal (always a bare domain
  // in both systems); fall back to search_console's if a client has that
  // but not ahrefs.
  const domainByClientId = new Map<string, string>();
  for (const a of existingAccounts) {
    if (a.platform !== "ahrefs" && a.platform !== "search_console") continue;
    if (a.platform === "search_console" && domainByClientId.has(a.clientId)) continue; // ahrefs already won
    const normalized = normalizeDomain(a.externalId);
    if (a.platform === "ahrefs") domainByClientId.set(a.clientId, normalized);
    else if (!domainByClientId.has(a.clientId)) domainByClientId.set(a.clientId, normalized);
  }

  const existingClientIdByDomain = new Map<string, string>();
  for (const [clientId, domain] of domainByClientId) {
    existingClientIdByDomain.set(domain, clientId);
  }

  const accountKey = (clientId: string, platform: string) => `${clientId}:${platform}`;
  const existingAccountKeys = new Set(existingAccounts.map((a) => accountKey(a.clientId, a.platform)));

  let merged = 0;
  let created = 0;
  let skippedExcluded = 0;
  let mappingsAdded = 0;

  for (const legacy of legacyClients) {
    if (legacy.status === "excluded") {
      skippedExcluded++;
      continue;
    }

    const normalizedDomain = normalizeDomain(legacy.domain);
    const existingClientId = existingClientIdByDomain.get(normalizedDomain);

    if (existingClientId) {
      const existing = existingClients.find((c) => c.id === existingClientId)!;
      let addedAny = false;

      if (legacy.gsc_property && !existingAccountKeys.has(accountKey(existingClientId, "search_console"))) {
        await db.insert(clientPlatformAccounts).values({
          clientId: existingClientId,
          platform: "search_console",
          externalId: legacy.gsc_property,
        });
        existingAccountKeys.add(accountKey(existingClientId, "search_console"));
        mappingsAdded++;
        addedAny = true;
      }

      if (!existingAccountKeys.has(accountKey(existingClientId, "ahrefs"))) {
        await db.insert(clientPlatformAccounts).values({
          clientId: existingClientId,
          platform: "ahrefs",
          externalId: legacy.domain,
        });
        existingAccountKeys.add(accountKey(existingClientId, "ahrefs"));
        mappingsAdded++;
        addedAny = true;
      }

      console.log(
        addedAny
          ? `Merged into ${existing.name} (${existingClientId}) — filled missing mapping(s).`
          : `${existing.name} (${existingClientId}) already fully mapped — no-op.`,
      );
      merged++;
      continue;
    }

    // No existing client for this domain — check by name too, in case a
    // prior partial run of this same script already created it (name
    // collisions with a real, differently-onboarded client are not
    // expected here since we already matched every real client by
    // domain above).
    const [existingByName] = await db.select().from(clients).where(eq(clients.name, legacy.name)).limit(1);
    if (existingByName) {
      console.log(`Skipping ${legacy.name} — already present by name (${existingByName.id}).`);
      merged++;
      continue;
    }

    const [newClient] = await db
      .insert(clients)
      .values({
        name: legacy.name,
        // clients.json carries no per-client timezone — default to the
        // agency's own, editable later at /settings/clients/[id].
        timezone: "America/New_York",
        active: legacy.status === "active",
      })
      .returning();

    if (legacy.gsc_property) {
      await db.insert(clientPlatformAccounts).values({
        clientId: newClient.id,
        platform: "search_console",
        externalId: legacy.gsc_property,
      });
    }
    await db.insert(clientPlatformAccounts).values({
      clientId: newClient.id,
      platform: "ahrefs",
      externalId: legacy.domain,
    });

    console.log(`Created ${newClient.name} (${newClient.id}).`);
    created++;
  }

  console.log(
    `\nSEO client import complete. Matched existing: ${merged} (${mappingsAdded} mapping(s) added), created new: ${created}, excluded: ${skippedExcluded}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("SEO client import failed:", err);
    process.exit(1);
  });
