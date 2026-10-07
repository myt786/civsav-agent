"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db";
import { clientAnalyses } from "@/lib/db/schema";
import { isUuid } from "@/lib/settings/validation";
import type { RecommendationStatus, StoredAnalysis } from "@/lib/analysis/types";

const STATUSES: RecommendationStatus[] = ["open", "done", "dismissed"];

// The checklist on a client's analysis: tick a recommendation done, turn
// it down, or reopen it. Done/dismissed items are passed to the next
// report so it doesn't suggest them again.
export async function setAnalysisRecommendationStatus(
  analysisId: string,
  recommendationId: string,
  status: RecommendationStatus,
): Promise<{ error?: string }> {
  await requireSession();
  if (!isUuid(analysisId) || typeof recommendationId !== "string" || !STATUSES.includes(status)) {
    return { error: "That recommendation wasn't found." };
  }
  const db = await getDb();
  const rows = await db.select().from(clientAnalyses).where(eq(clientAnalyses.id, analysisId)).limit(1);
  const row = rows[0];
  if (!row) return { error: "That report wasn't found." };

  const report = row.report as StoredAnalysis;
  const exists = report.accounts.some((a) => a.recommendations.some((r) => r.id === recommendationId));
  if (!exists) return { error: "That recommendation wasn't found." };
  const now = new Date().toISOString();
  const updated: StoredAnalysis = {
    ...report,
    accounts: report.accounts.map((account) => ({
      ...account,
      recommendations: account.recommendations.map((rec) => {
        if (rec.id !== recommendationId) return rec;
        return { ...rec, status, statusAt: status === "open" ? null : now };
      }),
    })),
  };
  await db.update(clientAnalyses).set({ report: updated }).where(eq(clientAnalyses.id, analysisId));
  revalidatePath(`/settings/clients/${row.clientId}`);
  revalidatePath("/insights");
  return {};
}
