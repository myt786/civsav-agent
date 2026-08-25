import type { ReactNode } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { logout } from "../login/actions";
import { Button } from "@/components/ui/button";
import { NavBrand } from "@/components/nav-brand";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex flex-col">
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-3">
          <NavBrand />
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground hover:underline">
              Dashboard
            </Link>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground hover:underline">
              Docs
            </Link>
          </nav>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <Link href="/settings/clients" className="text-lg font-medium text-foreground hover:underline">
              Settings
            </Link>
            <p className="text-sm text-muted-foreground">{session.email}</p>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        {children}
      </div>
    </div>
  );
}
