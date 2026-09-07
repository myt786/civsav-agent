import { NextResponse, type NextRequest } from "next/server";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/settings/login") return NextResponse.next();

  const session = await verifySessionCookieValue(request.cookies.get(SETTINGS_SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const loginUrl = new URL("/settings/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/settings/:path*"],
};
