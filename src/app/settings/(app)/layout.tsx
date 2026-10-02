import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/require-session";
import { logout } from "../login/actions";
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
        <header className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          {/* Sign out sits with the signed-in line rather than at the right
              end of the tabs, where the floating AI button covered it. */}
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>Signed in as {session.email}</span>
            <span aria-hidden>·</span>
            <form action={logout}>
              <button type="submit" className="text-primary underline-offset-2 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <SettingsTabs />
        {children}
      </div>
    </AppShell>
  );
}
