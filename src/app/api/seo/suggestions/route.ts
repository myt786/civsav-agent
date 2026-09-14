import { NextResponse } from "next/server";
import { getSeoDashboardData } from "@/lib/seo/queries";
import { generateSeoSuggestions } from "@/lib/seo/narrative";

// A single narrative model call, over data already computed elsewhere —
// called on demand from the detail sheet, not on every page render.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const clientId = body?.clientId;
  if (typeof clientId !== "string") {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  // Re-derived server-side from the database rather than trusting the row
  // the client already has in memory — same discipline as
  // /api/insights/narrative, so the model always reasons from the current
  // truth, not a payload that could have drifted since the sheet opened.
  const data = await getSeoDashboardData();
  const row = data.rows.find((r) => r.clientId === clientId);
  if (!row) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const suggestions = await generateSeoSuggestions(row);
    return NextResponse.json(suggestions);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate suggestions" },
      { status: 502 },
    );
  }
}
