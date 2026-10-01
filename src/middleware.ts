import { NextResponse, type NextRequest } from "next/server";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";

// Every page and API route needs the login, not just /settings: the
// dashboard, Insights and SEO pages show every client's numbers, and the AI
// routes (chat, summaries, recommendations) read client data, cost money per
// call, and in one case write to the database. They were previously open to
// anyone with the URL.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/settings/login") return NextResponse.next();

  const session = await verifySessionCookieValue(request.cookies.get(SETTINGS_SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const loginUrl = new URL("/settings/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next's own assets, static files, and the cron routes
  // (which authenticate with CRON_SECRET instead of a login cookie).
  matcher: ["/((?!_next/|api/cron/|favicon\\.ico|.*\\.(?:png|svg|ico|jpg|jpeg|webp|txt|xml)$).*)"],
};
