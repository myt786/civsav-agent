import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import type { Session } from "./session";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findTeamMember(email: string) {
  const db = await getDb();
  const [member] = await db.select().from(teamMembers).where(eq(teamMembers.email, normalizeEmail(email))).limit(1);
  return member ?? null;
}

// A personal-password session only lasts while that person is still on the
// team with the same password. Shared-password sessions (no memberId) are
// always fine. If the database can't be reached, the session is kept —
// a DB hiccup shouldn't sign everyone out.
export async function isSessionActive(session: Session): Promise<boolean> {
  if (!session.memberId) return true;
  try {
    const db = await getDb();
    const [member] = await db
      .select({ passwordSetAt: teamMembers.passwordSetAt })
      .from(teamMembers)
      .where(eq(teamMembers.id, session.memberId))
      .limit(1);
    return Boolean(member) && member.passwordSetAt.getTime() === session.pwv;
  } catch {
    return true;
  }
}
