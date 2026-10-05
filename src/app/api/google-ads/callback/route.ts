import { NextResponse, type NextRequest } from "next/server";
import { SETTINGS_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/auth/session";
import { finishConnect, OAUTH_COOKIE, type PendingConnect } from "@/lib/connectors/google-ads/oauth";

// Step 2 of "Connect Google Ads": Google sends the person back here. The
// state must match the cookie set in step 1, so a link from anywhere else
// can't attach a login. Always ends back on Settings → API keys with the
// outcome in the URL.
export async function GET(request: NextRequest) {
  const back = new URL("/settings/api-keys", request.url);
  const fail = (message: string) => {
    back.searchParams.set("gads", "error");
    back.searchParams.set("message", message);
    const response = NextResponse.redirect(back);
    response.cookies.delete({ name: OAUTH_COOKIE, path: "/api/google-ads" });
    return response;
  };

  const session = await verifySessionCookieValue(request.cookies.get(SETTINGS_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/settings/login?next=/settings/api-keys", request.url));

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    return fail(params.get("error") === "access_denied" ? "Google sign-in was cancelled." : `Google sign-in failed (${params.get("error")}).`);
  }

  let pending: PendingConnect | null = null;
  try {
    pending = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? "null") as PendingConnect | null;
  } catch {
    pending = null;
  }
  const code = params.get("code");
  if (!pending || !code || params.get("state") !== pending.state) {
    return fail("That sign-in link expired. Click Connect Google Ads and try again.");
  }

  let outcome;
  try {
    outcome = await finishConnect(request.nextUrl.origin, code, pending);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Something went wrong saving the login.");
  }
  if (!outcome.ok) return fail(outcome.error);

  back.searchParams.set("gads", outcome.replaced ? "reconnected" : "connected");
  back.searchParams.set("name", outcome.name);
  back.searchParams.set("accounts", String(outcome.accountCount));
  const response = NextResponse.redirect(back);
  response.cookies.delete({ name: OAUTH_COOKIE, path: "/api/google-ads" });
  return response;
}
