import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync/run";

// Rate-limited connectors (ghl: 1 req/s, google-ads: 1 req/30s) mean a run
// across many clients can genuinely take minutes, not seconds.
export const maxDuration = 300;

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` on scheduled
// invocations (see vercel.json). If CRON_SECRET isn't set, this compares
// against the literal string "Bearer undefined" — which a real request
// header can never equal — so an unconfigured secret fails closed, not
// open.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // ahrefs is metered and hard-stops when its unit budget runs out — it
  // has its own monthly cadence (see /api/cron/sync-monthly), so it's
  // excluded here rather than re-synced daily alongside everything else.
  const summary = await runSync(new Date(), { excludePlatforms: ["ahrefs"] });
  return NextResponse.json(summary);
}
