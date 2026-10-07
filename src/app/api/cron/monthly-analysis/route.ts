import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clientAnalyses, clients } from "@/lib/db/schema";
import { generateClientAnalysis } from "@/lib/analysis/generate";
import { periodsFor } from "@/lib/analysis/facts";
import { sendMonthlyAnalysisEmail } from "@/lib/analysis/email";

// Monthly AI analysis of every live client (see vercel.json): runs on the
// 2nd — after the month has closed and Ahrefs' monthly sync on the 1st —
// and again on the 3rd to pick up any client the first run didn't reach
// (each run skips clients that already have that month's report).
// ?send=1 (the 3rd, later in the morning) emails the team the results.
export const maxDuration = 300;

const BUDGET_MS = 260_000;
const CONCURRENCY = 3;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("send") === "1") {
    return NextResponse.json({ email: await sendMonthlyAnalysisEmail() });
  }

  const started = Date.now();
  const now = new Date();
  const db = await getDb();
  const live = await db
    .select({ id: clients.id, name: clients.name, timezone: clients.timezone })
    .from(clients)
    .where(and(eq(clients.active, true), isNull(clients.archivedAt)));
  const existing = await db
    .select({ clientId: clientAnalyses.clientId, periodStart: clientAnalyses.periodStart })
    .from(clientAnalyses)
    .where(eq(clientAnalyses.kind, "monthly"));
  const done = new Set(existing.map((r) => `${r.clientId}:${r.periodStart}`));
  const queue = live.filter((c) => !done.has(`${c.id}:${periodsFor("monthly", now, c.timezone).current.start}`));

  const results: { client: string; ok: boolean; note?: string }[] = [];
  async function worker() {
    while (queue.length > 0 && Date.now() - started < BUDGET_MS) {
      const client = queue.shift();
      if (!client) break;
      try {
        const { report } = await generateClientAnalysis(client.id, { kind: "monthly", createdBy: "monthly schedule", now });
        results.push({ client: client.name, ok: true, note: `score ${report.healthScore}` });
      } catch (error) {
        results.push({ client: client.name, ok: false, note: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return NextResponse.json({ analysed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), left: queue.length });
}
