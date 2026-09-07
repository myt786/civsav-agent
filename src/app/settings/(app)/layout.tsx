import type { ReactNode } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();

  return (
    <AppShell>
      <div className="workspace">
        <header className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <p className="eyebrow mb-2">Agency administration</p>
            <Link
              href="/settings/clients"
              className="page-title hover:underline"
            >
              Settings
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Signed in as {session.email}
            </p>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        {children}
      </div>
    </AppShell>
  );
}
