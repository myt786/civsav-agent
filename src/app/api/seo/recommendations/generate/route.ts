import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clientSeoRecommendations } from "@/lib/db/schema";
import { generateClientRecommendation } from "@/lib/seo/recommendations";
import { carryHistory, parseStoredRecommendations, type StoredRecommendations } from "@/lib/seo/recommendation-items";
import { isUuid } from "@/lib/settings/validation";

// A sitemap fetch (up to 4 requests) + a deeper GSC pull (2 requests) +
// one LLM call, all sequential-ish for a single client — generous but
// bounded, and this is only ever called for one client per request (the
// "generate all" loop drives many of these from the browser instead of
// one long server call — see the Recommendations tab).
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const clientId = body?.clientId;
  if (typeof clientId !== "string" || !isUuid(clientId)) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const db = await getDb();
  // What the team ticked off or turned down on the current list is kept,
  // so the new list doesn't repeat it.
  const [previousRow] = await db
    .select()
    .from(clientSeoRecommendations)
    .where(eq(clientSeoRecommendations.clientId, clientId))
    .limit(1);
  const previous = previousRow ? parseStoredRecommendations(previousRow.recommendations, previousRow.sitemapUrlCount) : null;
  const history = carryHistory(previous);

  let result;
  try {
    result = await generateClientRecommendation(clientId, history);
  } catch (error) {
    console.error("seo recommendations: generation failed", error);
    return NextResponse.json(
      { error: error instanceof Error && error.message === "Client not found" ? "Client not found" : "Couldn't write recommendations right now." },
      { status: 502 },
    );
  }

  const stored: StoredRecommendations = { version: 2, items: result.items, sources: result.sources, history };
  const now = new Date();
  await db
    .insert(clientSeoRecommendations)
    .values({ clientId, recommendations: stored, sitemapUrlCount: result.sources.sitemapUrls, generatedAt: now })
    .onConflictDoUpdate({
      target: clientSeoRecommendations.clientId,
      set: { recommendations: stored, sitemapUrlCount: result.sources.sitemapUrls, generatedAt: now },
    });

  return NextResponse.json({ clientId, ...stored, generatedAt: now.toISOString() });
}
