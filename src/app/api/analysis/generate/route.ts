import { NextResponse, type NextRequest } from "next/server";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";
import { generateClientAnalysis } from "@/lib/analysis/generate";
import { latestGeneratedAt } from "@/lib/analysis/queries";
import { isUuid } from "@/lib/settings/validation";

// "Analyse now" on a client's page (and "Analyse all" on Insights, which
// calls this once per client from the browser). One OpenAI call per client.
export const maxDuration = 60;

// Re-running the same client right away only costs money for the same answer.
const MIN_GAP_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const session = await verifySessionCookieValue(request.cookies.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { clientId?: unknown; force?: unknown } | null;
  const clientId = body?.clientId;
  if (typeof clientId !== "string" || !isUuid(clientId)) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  const last = await latestGeneratedAt(clientId, "on_demand");
  if (last && Date.now() - last.getTime() < MIN_GAP_MS) {
    const minutes = Math.ceil((MIN_GAP_MS - (Date.now() - last.getTime())) / 60000);
    return NextResponse.json(
      { error: `This client was analysed a few minutes ago. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, skipped: true },
      { status: 429 },
    );
  }

  try {
    const { id, report } = await generateClientAnalysis(clientId, { kind: "on_demand", createdBy: session.email });
    return NextResponse.json({ id, healthScore: report.healthScore, headline: report.headline });
  } catch (error) {
    console.error("client analysis failed", clientId, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't analyse this client right now." },
      { status: 502 },
    );
  }
}
