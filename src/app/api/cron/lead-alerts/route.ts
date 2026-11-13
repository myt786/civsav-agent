import { NextResponse } from "next/server";
import { runLeadAlerts } from "@/lib/lead-alerts/run";

// Lead alerts (see vercel.json): once after the morning sync, on yesterday's
// numbers, and again in the afternoon (?today=1) with today's leads so far
// from the lead platforms, so a stoppage is caught the same day.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const includeToday = new URL(request.url).searchParams.get("today") === "1";
  const result = await runLeadAlerts({ includeToday, budgetMs: 200_000 });
  return NextResponse.json(result);
}
