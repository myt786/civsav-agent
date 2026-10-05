import { asc } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";
import { TeamManager, type TeamMemberRow } from "@/components/settings/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const db = await getDb();
  const [rows, jar] = await Promise.all([db.select().from(teamMembers).orderBy(asc(teamMembers.email)), cookies()]);
  const session = await verifySessionCookieValue(jar.get(SETTINGS_SESSION_COOKIE)?.value);

  const members: TeamMemberRow[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    passwordSetAt: row.passwordSetAt.toISOString(),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    isYou: session?.memberId === row.id,
  }));

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 className="font-heading text-lg font-medium text-foreground">Team</h2>
        <p className="text-sm text-muted-foreground">
          Everyone here signs in with their own email and password. Passwords are generated for you and shown once, so
          copy them before closing. Removing someone, or resetting their password, signs them out straight away.
        </p>
      </div>
      <TeamManager members={members} />
    </div>
  );
}
