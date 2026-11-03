import { NextResponse, type NextRequest } from "next/server";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";
import { isSessionActive } from "@/lib/auth/team";
import { getLeadReport } from "@/lib/lead-report/queries";
import { renderLeadReportPdf } from "@/lib/lead-report/pdf";
import { leadReportFilename } from "@/lib/lead-report/email";
import { isUuid } from "@/lib/settings/validation";

// The PDF exactly as the client will get it — for reviewers to check first.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySessionCookieValue(request.cookies.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session || !(await isSessionActive(session))) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = await getLeadReport(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdf = renderLeadReportPdf(row.report, row.sentAt ? new Date(row.sentAt) : new Date());
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${leadReportFilename(row)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
