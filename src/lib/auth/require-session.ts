import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "./session";

// Defense in depth: middleware already gates /settings/*, but server
// actions can be invoked directly (they're just POST endpoints under the
// hood), so every mutation re-checks the session itself rather than
// trusting that a request only arrives here via the gated page.
export async function requireSession(): Promise<{ email: string }> {
  const jar = await cookies();
  const session = await verifySessionCookieValue(jar.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session) redirect("/settings/login");
  return session;
}
