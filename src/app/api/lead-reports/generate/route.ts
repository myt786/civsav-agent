import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";
import { isSessionActive } from "@/lib/auth/team";
import { generateLeadReport } from "@/lib/lead-report/generate";
import { isLeadTone } from "@/lib/lead-report/tone";
import { isUuid } from "@/lib/settings/validation";

// "Make a report now" (any period length) and "Rewrite in this tone" on a
// report under review. One OpenAI call per 25 leads plus one for the summary.
export const maxDuration = 300;

const DAY_CHOICES = [7, 14, 30, 60, 90, 180];

export async function POST(request: NextRequest) {
  const session = await verifySessionCookieValue(request.cookies.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session || !(await isSessionActive(session))) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { clientId?: unknown; days?: unknown; tone?: unknown; toneNote?: unknown; replaceId?: unknown }
    | null;
  const clientId = body?.clientId;
  if (typeof clientId !== "string" || !isUuid(clientId)) return NextResponse.json({ error: "Pick a client." }, { status: 400 });
  const days = typeof body?.days === "number" && DAY_CHOICES.includes(body.days) ? body.days : 30;
  const tone = isLeadTone(body?.tone) ? body.tone : undefined;
  const toneNote = typeof body?.toneNote === "string" ? body.toneNote.slice(0, 400) : undefined;
  const replaceId = typeof body?.replaceId === "string" && isUuid(body.replaceId) ? body.replaceId : undefined;

  try {
    const { id, report } = await generateLeadReport(clientId, {
      kind: "on_demand",
      createdBy: session.email,
      days,
      tone,
      toneNote,
      replaceId,
    });
    revalidatePath("/settings/lead-reports");
    revalidatePath(`/settings/lead-reports/${id}`);
    return NextResponse.json({ id, open: report.counts.open, tier1: report.counts.tier1 });
  } catch (error) {
    console.error("lead report failed", clientId, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't make the report right now." }, { status: 502 });
  }
}
