"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionCookieValue, SETTINGS_SESSION_COOKIE } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

// Compare digests rather than the strings themselves, so the time taken
// doesn't reveal how much of a guess was right.
async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface LoginState {
  error?: string;
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const expectedPassword = process.env.SETTINGS_PASSWORD;
  if (!expectedPassword) {
    return { error: "Sign-in isn't set up yet — ask your developer to set SETTINGS_PASSWORD." };
  }
  if (!(await passwordMatches(parsed.data.password, expectedPassword))) {
    // One shared password guards every client's data: slow down guessing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { error: "Incorrect password." };
  }

  const jar = await cookies();
  jar.set(SETTINGS_SESSION_COOKIE, await createSessionCookieValue(parsed.data.email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  const next = formData.get("next");
  // Any same-site path ("/insights", "/seo"...) now that every page needs the
  // login; "//host" is rejected so this can't become an open redirect.
  redirect(typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SETTINGS_SESSION_COOKIE);
  redirect("/settings/login");
}
