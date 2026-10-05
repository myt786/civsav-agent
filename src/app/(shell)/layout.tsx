import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";
import { isSessionActive } from "@/lib/auth/team";

// Shared by every top-level page (dashboard, insights, docs) via this route
// group — one persistent shell instance that survives navigation between
// them, so only the content area shows a loading.tsx skeleton instead of
// the whole page (sidebar included) flashing on every route change.
export default async function ShellLayout({ children }: { children: ReactNode }) {
  // The middleware only checks the cookie's signature; this also ends the
  // session of someone removed from Settings → Team.
  const jar = await cookies();
  const session = await verifySessionCookieValue(jar.get(SETTINGS_SESSION_COOKIE)?.value);
  if (session && !(await isSessionActive(session))) redirect("/settings/login?ended=1");
  return <AppShell>{children}</AppShell>;
}
