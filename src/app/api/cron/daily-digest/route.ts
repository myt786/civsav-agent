import { NextResponse } from "next/server";
import { sendDailyDigest } from "@/lib/insights/send-daily-digest";

// Runs at 08:30 UTC (see vercel.json), after the 08:00 daily sync has had
// its full 300s budget, so the summary covers this morning's numbers.
export const maxDuration = 60;

// Same bearer-secret check as /api/cron/sync — see that route's comment.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.json(await sendDailyDigest());
}
