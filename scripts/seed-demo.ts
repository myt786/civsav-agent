import "dotenv/config";
import { format, subDays, addHours } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getDb } from "../src/lib/db";
import {
  clients,
  clientPlatformAccounts,
  configChanges,
  syncRuns,
  rawResponses,
  metricSnapshots,
} from "../src/lib/db/schema";
import type { Platform } from "../src/lib/connectors/types";
import { leadDashboardDataSchema } from "../src/lib/connectors/lead-dashboard/schema";
import { telephonyDataSchema } from "../src/lib/connectors/openphone/schema";
import { googleAdsDataSchema } from "../src/lib/connectors/google-ads/schema";
import { metaDataSchema } from "../src/lib/connectors/meta/schema";
import { ga4DataSchema } from "../src/lib/connectors/ga4/schema";
import { searchConsoleDataSchema } from "../src/lib/connectors/search-console/schema";
import { seoDataSchema } from "../src/lib/connectors/ahrefs/schema";
import { ghlDataSchema } from "../src/lib/connectors/ghl/schema";

// Populates the local dev database with a realistic 32-day history across
// five clients, deliberately varied so every dashboard state shows up when
// the app is run locally: ok, no_data (gaps / unconnected platforms),
// unverified (recent days), and error (a couple of scripted failed pulls) —
// plus one client whose whole pipeline has gone stale (>36h). This is a dev
// tool only; it wipes and rebuilds the demo tables it owns.

const DAYS = 32;

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randFloat(min: number, max: number, decimals = 2): number {
  return Number((min + Math.random() * (max - min)).toFixed(decimals));
}

interface ClientSpec {
  name: string;
  timezone: string;
  platforms: Platform[];
  // Days 0..N-1 back are unreconciled. Varied per client (rather than one
  // global constant) so the table shows a real mix of plain "ok" numbers
  // next to "unverified" ones, instead of every current-week cell tainted
  // the same way.
  unverifiedDays: number;
}

const CLIENT_SPECS: ClientSpec[] = [
  {
    name: "Acme Roofing",
    timezone: "America/New_York",
    platforms: ["lead_dashboard", "google_ads", "meta", "ga4", "search_console", "openphone", "ahrefs"],
    unverifiedDays: 0,
  },
  {
    name: "Blue Ridge Dental",
    timezone: "America/Chicago",
    platforms: ["lead_dashboard", "google_ads", "ga4", "search_console", "openphone"],
    unverifiedDays: 2,
  },
  {
    name: "Coastal HVAC",
    timezone: "America/Los_Angeles",
    platforms: ["lead_dashboard", "meta", "ga4", "openphone", "ahrefs"],
    unverifiedDays: 0,
  },
  {
    name: "Desert Legal Group",
    timezone: "America/Denver",
    platforms: ["lead_dashboard", "google_ads", "meta", "ga4", "search_console", "openphone"],
    unverifiedDays: 3,
  },
  {
    name: "Evergreen Landscaping",
    timezone: "America/New_York",
    platforms: ["lead_dashboard", "ghl"],
    unverifiedDays: 1,
  },
];

function metricsFor(platform: Platform, dateKey: string): { data: unknown; schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } } } | null {
  switch (platform) {
    case "lead_dashboard": {
      const byStatus = { new: randInt(0, 5), contacted: randInt(0, 4), qualified: randInt(0, 3), won: randInt(0, 2), lost: randInt(0, 2) };
      const totalLeads = Object.values(byStatus).reduce((a, b) => a + b, 0);
      return { data: { totalLeads, byStatus, rangeStart: dateKey, rangeEnd: dateKey }, schema: leadDashboardDataSchema };
    }
    case "openphone": {
      const totalCalls = randInt(5, 20);
      const missedCalls = randInt(0, Math.floor(totalCalls * 0.4));
      const forwardedCalls = randInt(0, Math.floor(totalCalls * 0.3));
      const missedAndForwardedCalls = randInt(0, Math.min(missedCalls, forwardedCalls));
      return {
        data: {
          totalCalls,
          missedCalls,
          forwardedCalls,
          missedAndForwardedCalls,
          totalDurationSeconds: totalCalls * randInt(30, 240),
          rangeStart: dateKey,
          rangeEnd: dateKey,
        },
        schema: telephonyDataSchema,
      };
    }
    case "google_ads": {
      const cost = randFloat(30, 200);
      const conversions = randInt(1, 10);
      return {
        data: {
          impressions: randInt(1000, 6000),
          clicks: randInt(30, 250),
          cost,
          conversions,
          cpl: conversions > 0 ? Number((cost / conversions).toFixed(2)) : null,
          rangeStart: dateKey,
          rangeEnd: dateKey,
        },
        schema: googleAdsDataSchema,
      };
    }
    case "meta": {
      const spend = randFloat(50, 350);
      const results = randInt(2, 10);
      return {
        data: {
          spend,
          impressions: randInt(3000, 11000),
          clicks: randInt(60, 200),
          results,
          cpl: results > 0 ? Number((spend / results).toFixed(2)) : null,
          deliveryStatus: "ACTIVE",
          attributionWindow: "7d_click_1d_view",
          rangeStart: dateKey,
          rangeEnd: dateKey,
        },
        schema: metaDataSchema,
      };
    }
    case "ga4": {
      const totalSessions = randInt(100, 450);
      const totalConversions = randInt(5, 30);
      return {
        data: {
          totalSessions,
          totalConversions,
          trafficSources: [
            { source: "google", sessions: Math.round(totalSessions * 0.6), conversions: Math.round(totalConversions * 0.6) },
          ],
          conversionEvents: [{ eventName: "generate_lead", conversions: totalConversions }],
          rangeStart: dateKey,
          rangeEnd: dateKey,
        },
        schema: ga4DataSchema,
      };
    }
    case "search_console": {
      return {
        data: {
          totalImpressions: randInt(200, 900),
          totalClicks: randInt(10, 60),
          averagePosition: randFloat(3, 11, 1),
          topQueries: [],
          dataDate: dateKey,
        },
        schema: searchConsoleDataSchema,
      };
    }
    case "ahrefs": {
      return {
        data: {
          domainRating: randInt(30, 60),
          trafficEstimate: randInt(5000, 20000),
          keywordPositions: { top3: randInt(5, 20), top10: randInt(20, 60), top100: randInt(150, 400) },
          rangeStart: dateKey,
          rangeEnd: dateKey,
        },
        schema: seoDataSchema,
      };
    }
    case "ghl": {
      return {
        data: {
          leadCount: randInt(3, 10),
          pipelineStages: [{ stage: "New Lead", count: randInt(1, 5) }],
          opportunityValue: randFloat(1000, 6000, 0),
          rangeStart: dateKey,
          rangeEnd: dateKey,
        },
        schema: ghlDataSchema,
      };
    }
    default:
      return null;
  }
}

// Fake but correctly-formatted IDs — the settings UI validates external
// IDs on save, so seed data needs to pass the same per-platform format
// checks a real save would, not just look plausible.
function plausibleExternalId(platform: Platform, index: number, clientName: string): string {
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  switch (platform) {
    case "google_ads":
      return String(1234567890 + index);
    case "meta":
      return `act_${9876543210 + index}`;
    case "ga4":
      return String(100000000 + index);
    case "search_console":
      return `https://${slug}.example.com/`;
    case "ahrefs":
      return `${slug}.example.com`;
    case "openphone":
      return `+1415555${1000 + index}`;
    case "ghl":
      return `ghl-location-${index}`;
    case "lead_dashboard":
      return `lead-dashboard-client-${index}`;
  }
}

// fetchedAt for the sync that produced `dateKey`'s data — the morning
// after, matching how the real cron would run against "yesterday".
function fetchedAtFor(timezone: string, dateKey: string): Date {
  const nextDay = format(addHours(fromZonedTime(`${dateKey}T00:00:00.000`, timezone), 24), "yyyy-MM-dd");
  return fromZonedTime(`${nextDay}T06:${String(randInt(5, 45)).padStart(2, "0")}:00.000`, timezone);
}

async function main() {
  const db = await getDb();
  const now = new Date();

  console.log("Clearing existing demo tables...");
  await db.delete(rawResponses);
  await db.delete(metricSnapshots);
  await db.delete(configChanges);
  await db.delete(clientPlatformAccounts);
  await db.delete(syncRuns);
  await db.delete(clients);

  // One sync_runs row per calendar day of history — every raw_responses row
  // references one of these. The last one (today) is where the scripted
  // "most recent run" errors land, so the sync status strip has something
  // real to show.
  const syncRunIdByDaysAgo = new Map<number, string>();
  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const startedAt = subDays(now, daysAgo);
    const hasErrors = daysAgo === 0;
    const [run] = await db
      .insert(syncRuns)
      .values({
        startedAt,
        finishedAt: addHours(startedAt, 1),
        status: hasErrors ? "completed_with_errors" : "completed",
      })
      .returning();
    syncRunIdByDaysAgo.set(daysAgo, run.id);
  }

  for (const [index, spec] of CLIENT_SPECS.entries()) {
    const [client] = await db.insert(clients).values({ name: spec.name, timezone: spec.timezone }).returning();
    console.log(`Seeding ${client.name} (${client.id})...`);

    for (const platform of spec.platforms) {
      // Everything is verified-via-Settings except one mapping, left
      // never-verified on purpose so that state shows up in the demo too.
      const neverVerified = spec.name === "Evergreen Landscaping" && platform === "ghl";
      await db.insert(clientPlatformAccounts).values({
        clientId: client.id,
        platform,
        externalId: plausibleExternalId(platform, index, spec.name),
        verifiedAt: neverVerified ? null : subDays(now, randInt(0, 5)),
        verifiedStatus: neverVerified ? null : "ok",
      });
    }

    // "yesterday" and back, in the client's own timezone — same anchoring
    // the real sync engine and the dashboard queries use.
    const anchor = subDays(toZonedTime(now, spec.timezone), 1);

    for (const platform of spec.platforms) {
      for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
        const dateKey = format(subDays(anchor, daysAgo), "yyyy-MM-dd");

        // --- Scripted scenarios, layered on top of the normal random fill ---

        // Desert Legal Group: the whole pipeline has been silent for the
        // last 2 days (stale row). Its openphone connector has genuinely
        // had no data for the entire current 7-day window — not just a
        // gap in an otherwise-fine week — and the most recent thing that
        // was actually attempted for it was a real failure, so the Calls
        // column should render as an error, not a stale partial number.
        if (spec.name === "Desert Legal Group") {
          if (daysAgo < 2) continue; // nothing synced at all the last 2 days
          if (platform === "openphone" && daysAgo <= 6) {
            if (daysAgo === 2) {
              const syncRunId = syncRunIdByDaysAgo.get(daysAgo)!;
              await db.insert(rawResponses).values({
                syncRunId,
                clientId: client.id,
                platform,
                payload: { error: "OpenPhone: request failed with status 401 (invalid API key)" },
                fetchedAt: fetchedAtFor(spec.timezone, dateKey),
              });
            }
            continue; // no snapshot for any day in the window — genuinely empty
          }
        }

        // Blue Ridge Dental: google_ads has had no data all week (a
        // standing rate-limit failure, most recently attempted today) —
        // the whole current window is empty, so Spend (which blends in
        // google_ads) should show an error, not silently roll up meta
        // alone as if that were the complete picture.
        if (spec.name === "Blue Ridge Dental" && platform === "google_ads" && daysAgo <= 6) {
          if (daysAgo === 0) {
            const syncRunId = syncRunIdByDaysAgo.get(daysAgo)!;
            await db.insert(rawResponses).values({
              syncRunId,
              clientId: client.id,
              platform,
              payload: { error: "Google Ads API error: RESOURCE_EXHAUSTED (rate limit)" },
              fetchedAt: fetchedAtFor(spec.timezone, dateKey),
            });
          }
          continue;
        }

        // Coastal HVAC: today's Ahrefs pull failed — visible in the sync
        // strip even though Ahrefs isn't one of the table's columns.
        if (spec.name === "Coastal HVAC" && platform === "ahrefs" && daysAgo === 0) {
          const syncRunId = syncRunIdByDaysAgo.get(daysAgo)!;
          await db.insert(rawResponses).values({
            syncRunId,
            clientId: client.id,
            platform,
            payload: { error: "Ahrefs API error: unit budget exhausted for this period" },
            fetchedAt: fetchedAtFor(spec.timezone, dateKey),
          });
          continue;
        }

        // Coastal HVAC: today's meta pull failed, but the rest of the week
        // is fine — should still roll up as a real (partial) number,
        // rather than blank the whole column out over one bad day.
        if (spec.name === "Coastal HVAC" && platform === "meta" && daysAgo === 0) {
          const syncRunId = syncRunIdByDaysAgo.get(daysAgo)!;
          await db.insert(rawResponses).values({
            syncRunId,
            clientId: client.id,
            platform,
            payload: { error: "Meta Graph API error: temporary server error, please retry" },
            fetchedAt: fetchedAtFor(spec.timezone, dateKey),
          });
          continue;
        }

        // Ahrefs (everyone else) only reports a few times a month — sparse
        // by nature, not a failure.
        if (platform === "ahrefs" && Math.random() > 0.2) continue;

        const built = metricsFor(platform, dateKey);
        if (!built) continue;

        const parsed = built.schema.safeParse(built.data);
        if (!parsed.success) {
          throw new Error(`generated ${platform} metrics for ${dateKey} failed its own schema: ${JSON.stringify(parsed.error)}`);
        }

        const syncRunId = syncRunIdByDaysAgo.get(daysAgo)!;
        const fetchedAt = fetchedAtFor(spec.timezone, dateKey);

        await db.insert(rawResponses).values({
          syncRunId,
          clientId: client.id,
          platform,
          payload: built.data as object,
          fetchedAt,
        });

        await db.insert(metricSnapshots).values({
          clientId: client.id,
          platform,
          date: dateKey,
          metrics: built.data as object,
          verified: daysAgo >= spec.unverifiedDays,
          createdAt: fetchedAt,
        });
      }
    }
  }

  console.log("Demo seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Demo seed failed:", err);
    process.exit(1);
  });
