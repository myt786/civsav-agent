import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue, type Session } from "./session";
import { isSessionActive } from "./team";

// Defense in depth: middleware already gates /settings/*, but server
// actions can be invoked directly (they're just POST endpoints under the
// hood), so every mutation re-checks the session itself rather than
// trusting that a request only arrives here via the gated page.
export async function requireSession(): Promise<Session> {
  const jar = await cookies();
  const session = await verifySessionCookieValue(jar.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session) redirect("/settings/login");
  // Removed from Settings → Team, or their password was reset.
  if (!(await isSessionActive(session))) redirect("/settings/login?ended=1");
  return session;
}
