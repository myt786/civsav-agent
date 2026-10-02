import { NextResponse } from "next/server";
import { buildAccessReport } from "@/lib/settings/access-report";
import { buildAccessReportEmail } from "@/lib/email/templates";
import { emailReport } from "@/lib/email/reports";
import { getAppUrl } from "@/lib/app-url";

// Mondays 09:00 UTC (see vercel.json): who needs account access given or
// fixed, emailed to everyone ticked for the access report.
export const maxDuration = 60;

// Same bearer-secret check as /api/cron/sync — see that route's comment.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const report = await buildAccessReport();
  const email = await emailReport("access", buildAccessReportEmail(report, getAppUrl()));
  return NextResponse.json({
    email,
    notWorking: report.notWorking.length,
    notChecked: report.notChecked.length,
  });
}
