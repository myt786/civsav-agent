"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { getDb } from "@/lib/db";
import { clientSeoMonthly } from "@/lib/db/schema";
import { logChanges } from "@/lib/settings/audit";

const seoMonthlySchema = z.object({
  seoOwner: z.string().trim().max(200).nullable(),
  status: z.string().trim().max(50).nullable(),
  notes: z.string().trim().max(4000).nullable(),
});

function readFormData(formData: FormData) {
  const toNullableString = (v: FormDataEntryValue | null) => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return seoMonthlySchema.safeParse({
    seoOwner: toNullableString(formData.get("seoOwner")),
    status: toNullableString(formData.get("status")),
    notes: toNullableString(formData.get("notes")),
  });
}

export interface SeoMonthlyFormState {
  error?: string;
}

// Upserts the CURRENT month's SEO Owner/Status/Notes for one client. There
// is no separate "carry forward" step — next month's Prev. Month Summary
// is simply this month's `notes`, read directly by getSeoDashboardData.
export async function updateSeoMonthly(
  clientId: string,
  month: string,
  _prevState: SeoMonthlyFormState,
  formData: FormData,
): Promise<SeoMonthlyFormState> {
  const session = await requireSession();
  const parsed = readFormData(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(clientSeoMonthly)
    .where(and(eq(clientSeoMonthly.clientId, clientId), eq(clientSeoMonthly.month, month)))
    .limit(1);

  await db
    .insert(clientSeoMonthly)
    .values({ clientId, month, ...parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [clientSeoMonthly.clientId, clientSeoMonthly.month],
      set: { ...parsed.data, updatedAt: new Date() },
    });

  await logChanges(db, [
    {
      userEmail: session.email,
      clientId,
      field: "seo_owner",
      oldValue: existing?.seoOwner ?? null,
      newValue: parsed.data.seoOwner,
    },
    {
      userEmail: session.email,
      clientId,
      field: "seo_status",
      oldValue: existing?.status ?? null,
      newValue: parsed.data.status,
    },
    {
      userEmail: session.email,
      clientId,
      field: "seo_notes",
      oldValue: existing?.notes ?? null,
      newValue: parsed.data.notes,
    },
  ]);

  revalidatePath("/seo");
  return {};
}
