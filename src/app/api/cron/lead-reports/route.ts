import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, leadReports } from "@/lib/db/schema";
import { generateLeadReport } from "@/lib/lead-report/generate";
import { leadPeriodFor } from "@/lib/lead-report/period";
import { emailLeadReportsForReview } from "@/lib/lead-report/email";
import type { LeadReportKind } from "@/lib/lead-report/types";
import type { LeadReviewEmailEntry } from "@/lib/email/templates";

// Daily (see vercel.json): makes each client's weekly report once last
// week has closed (Mondays) and the monthly one once last month has (the
// 1st), after the morning sync. A client whose report is missing — the run
// was cut off, or the AI failed — is picked up the next day. New reports
// go to the team to review; nothing is sent to a client from here.
export const maxDuration = 300;

const BUDGET_MS = 240_000;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const started = Date.now();
  const now = new Date();
  const db = await getDb();
  const live = await db
    .select({ id: clients.id, name: clients.name, timezone: clients.timezone, cadence: clients.leadReportCadence })
    .from(clients)
    .where(and(eq(clients.active, true), isNull(clients.archivedAt)));
  const scheduled = live.filter((c) => c.cadence === "weekly" || c.cadence === "monthly");
  const existing = scheduled.length
    ? await db.select({ clientId: leadReports.clientId, kind: leadReports.kind, periodStart: leadReports.periodStart }).from(leadReports)
    : [];
  const done = new Set(existing.map((r) => `${r.clientId}:${r.kind}:${r.periodStart}`));
  const queue = scheduled.filter((c) => {
    const kind = c.cadence as LeadReportKind;
    return !done.has(`${c.id}:${kind}:${leadPeriodFor(kind, now, c.timezone).start}`);
  });

  const made: LeadReviewEmailEntry[] = [];
  const failed: { client: string; error: string }[] = [];
  while (queue.length > 0 && Date.now() - started < BUDGET_MS) {
    const client = queue.shift()!;
    try {
      const { id, report } = await generateLeadReport(client.id, { kind: client.cadence as LeadReportKind, createdBy: `${client.cadence} schedule`, now });
      if (report.counts.total > 0) {
        made.push({ reportId: id, clientName: client.name, periodLabel: report.period.label, headline: report.summary.headline, tier1: report.counts.tier1, open: report.counts.open });
      }
    } catch (error) {
      failed.push({ client: client.name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const email = made.length > 0 ? await emailLeadReportsForReview(made) : null;
  return NextResponse.json({ made: made.length, failed, left: queue.length, email });
}
