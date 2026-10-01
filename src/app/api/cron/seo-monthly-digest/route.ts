import { NextResponse } from "next/server";
import { getSeoDashboardData } from "@/lib/seo/queries";
import { buildDigestSummary, postSeoDigestToSlack } from "@/lib/seo/digest";

// Runs on the 4th (see vercel.json): after /api/cron/sync-monthly (Ahrefs,
// on the 1st), and after Search Console has published the last days of the
// month just completed (it lags 2-3 days). On the 1st, those days were
// still missing, so every digest compared a short month and leaned towards
// "declining".
export const maxDuration = 60;

// Same bearer-secret check as /api/cron/sync — see that route's comment.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const data = await getSeoDashboardData();
  const summary = buildDigestSummary(data);
  const result = await postSeoDigestToSlack(summary);

  return NextResponse.json({ summary, slack: result });
}
