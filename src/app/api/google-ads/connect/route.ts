import { NextResponse, type NextRequest } from "next/server";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";
import { OAUTH_COOKIE, startConnect } from "@/lib/connectors/google-ads/oauth";

// Step 1 of "Connect Google Ads": remembers who's connecting (and what to
// call the login) in a short-lived cookie, then sends them to Google.
export async function GET(request: NextRequest) {
  const session = await verifySessionCookieValue(request.cookies.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/settings/login?next=/settings/api-keys", request.url));

  const params = request.nextUrl.searchParams;
  const started = startConnect(request.nextUrl.origin, {
    name: params.get("name") ?? "",
    managerId: params.get("managerId") ?? "",
    createdBy: session.email,
  });
  if (!started.ok) {
    const back = new URL("/settings/api-keys", request.url);
    back.searchParams.set("gads", "error");
    back.searchParams.set("message", started.error);
    return NextResponse.redirect(back);
  }

  const response = NextResponse.redirect(started.url);
  response.cookies.set(OAUTH_COOKIE, JSON.stringify(started.pending), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/google-ads",
    maxAge: 600,
  });
  return response;
}
