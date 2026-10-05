"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { generatePassword, hashPassword } from "@/lib/auth/passwords";
import { normalizeEmail } from "@/lib/auth/team";
import { getDb } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import { isUuid } from "@/lib/settings/validation";

// Settings → Team. A password is generated here and returned exactly once,
// to show to whoever is adding the person; only its hash is stored.

export interface TeamActionResult {
  error?: string;
  email?: string;
  password?: string;
}

const emailSchema = z.email("Enter a valid email address.");

export async function addTeamMember(email: string): Promise<TeamActionResult> {
  const session = await requireSession();
  const parsed = emailSchema.safeParse(normalizeEmail(email));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  const db = await getDb();
  const [existing] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, parsed.data)).limit(1);
  if (existing) return { error: `${parsed.data} is already on the team. Use Reset password to give them a new one.` };

  const password = generatePassword();
  await db.insert(teamMembers).values({
    email: parsed.data,
    passwordHash: await hashPassword(password),
    passwordSetAt: new Date(),
    createdBy: session.email,
  });
  revalidatePath("/settings/team");
  return { email: parsed.data, password };
}

// A new password also signs them out everywhere (sessions carry the time
// the password was set).
export async function resetTeamMemberPassword(id: string): Promise<TeamActionResult> {
  await requireSession();
  if (!isUuid(id)) return { error: "That person wasn't found." };
  const db = await getDb();
  const [member] = await db.select({ email: teamMembers.email }).from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
  if (!member) return { error: "That person wasn't found." };
  const password = generatePassword();
  await db
    .update(teamMembers)
    .set({ passwordHash: await hashPassword(password), passwordSetAt: new Date() })
    .where(eq(teamMembers.id, id));
  revalidatePath("/settings/team");
  return { email: member.email, password };
}

export async function removeTeamMember(id: string): Promise<TeamActionResult> {
  const session = await requireSession();
  if (!isUuid(id)) return { error: "That person wasn't found." };
  if (session.memberId === id) return { error: "You can't remove yourself." };
  const db = await getDb();
  await db.delete(teamMembers).where(eq(teamMembers.id, id));
  revalidatePath("/settings/team");
  return {};
}
