import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync/run";

// Ahrefs is metered and hard-stops when its unit budget runs out for the
// period — syncing it on the same daily cron as every other platform
// would burn ~3 calls/client/day for numbers that barely move day to day.
// This route gives it its own monthly cadence instead (see vercel.json).
export const maxDuration = 300;

// Same bearer-secret check as /api/cron/sync — see that route's comment.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const summary = await runSync(new Date(), { platforms: ["ahrefs"] });
  return NextResponse.json(summary);
}
