import { NextResponse } from "next/server";
import { getSeoDashboardData } from "@/lib/seo/queries";
import { buildDigestSummary, postSeoDigestToSlack } from "@/lib/seo/digest";

// Runs after /api/cron/sync-monthly (see vercel.json) so the Ahrefs data
// it summarizes is fresh for the month just completed.
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
