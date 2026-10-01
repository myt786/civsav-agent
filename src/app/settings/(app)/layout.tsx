import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/require-session";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <AppShell>
      {/* Same width and spacing as the dashboard, so Settings doesn't feel
          like a different app and wide content (the platform strip, the
          client list) has room. Forms keep their own narrower widths. */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Signed in as {session.email}</p>
          </div>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        <SettingsTabs />
        {children}
      </div>
    </AppShell>
  );
}
