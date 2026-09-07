import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard/queries";
import { computeAttentionFlags } from "@/lib/insights/rules";
import { generateFleetNarrative } from "@/lib/insights/narrative";

// A single narrative model call, over data already computed elsewhere —
// generous enough for a cold provider connection without holding the page
// load hostage to it (this route is called on demand, not on page render).
export const maxDuration = 60;

export async function POST() {
  const now = new Date();
  const data = await getDashboardData(now);
  const flags = computeAttentionFlags(data);

  try {
    const narrative = await generateFleetNarrative(data, flags);
    return NextResponse.json(narrative);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate summary" },
      { status: 502 },
    );
  }
}
