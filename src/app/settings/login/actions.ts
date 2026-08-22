"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionCookieValue, SETTINGS_SESSION_COOKIE } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

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
    return { error: "Settings login isn't configured (SETTINGS_PASSWORD is unset)." };
  }
  if (parsed.data.password !== expectedPassword) {
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
  redirect(typeof next === "string" && next.startsWith("/settings") ? next : "/settings/clients");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SETTINGS_SESSION_COOKIE);
  redirect("/settings/login");
}
