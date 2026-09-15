import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { clientSeoRecommendations } from "@/lib/db/schema";
import { generateClientRecommendation } from "@/lib/seo/recommendations";

// A sitemap fetch (up to 4 requests) + a deeper GSC pull (2 requests) +
// one LLM call, all sequential-ish for a single client — generous but
// bounded, and this is only ever called for one client per request (the
// "generate all" loop drives many of these from the browser instead of
// one long server call — see /seo/recommendations UI).
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const clientId = body?.clientId;
  if (typeof clientId !== "string") {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  let result;
  try {
    result = await generateClientRecommendation(clientId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate recommendation" },
      { status: 502 },
    );
  }

  const db = await getDb();
  const now = new Date();
  const [saved] = await db
    .insert(clientSeoRecommendations)
    .values({
      clientId,
      recommendations: result.recommendations,
      sitemapUrlCount: result.sitemapUrlCount,
      generatedAt: now,
    })
    .onConflictDoUpdate({
      target: clientSeoRecommendations.clientId,
      set: { recommendations: result.recommendations, sitemapUrlCount: result.sitemapUrlCount, generatedAt: now },
    })
    .returning();

  return NextResponse.json(saved);
}
