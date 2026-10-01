import { NextResponse } from "next/server";
import { sendDailyDigest } from "@/lib/insights/send-daily-digest";

// "Send to Slack" on Insights — the same message the 08:30 cron posts,
// on demand. Behind the app login like every non-cron route (middleware).
export const maxDuration = 60;

export async function POST() {
  try {
    return NextResponse.json(await sendDailyDigest());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't post to Slack" },
      { status: 502 },
    );
  }
}
