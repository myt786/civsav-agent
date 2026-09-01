"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BookOpenIcon, LayoutDashboardIcon, MenuIcon, SearchIcon, SettingsIcon, SparklesIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/insights", label: "Insights", icon: SparklesIcon },
  { href: "/settings/clients", label: "Settings", icon: SettingsIcon },
  { href: "/docs", label: "Docs", icon: BookOpenIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ size = 24 }: { size?: number }) {
  return (
    <>
      <Image src="/civsav-icon.png" alt="" width={size} height={size} className="rounded-md" priority />
      <span className="text-sm font-semibold text-sidebar-foreground">civsav</span>
    </>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Persistent left sidebar on desktop, a slide-out sheet from a top bar on
// mobile — one shared shell so every top-level page (dashboard, insights,
// settings, docs) gets the same nav instead of re-declaring its own strip.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2 px-1.5">
            <Brand />
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center justify-between gap-2 rounded-lg border border-sidebar-border px-2.5 py-1.5 text-left text-xs text-sidebar-foreground/50 transition-colors hover:border-sidebar-ring/40 hover:text-sidebar-foreground/80"
          >
            <span className="flex items-center gap-1.5">
              <SearchIcon className="size-3.5" aria-hidden />
              Quick jump
            </span>
            <kbd className="rounded border border-sidebar-border px-1 font-mono text-[10px]">⌘K</kbd>
          </button>
          <NavLinks pathname={pathname} />
        </div>
        <div className="flex items-center justify-between px-1.5">
          <span className="text-[11px] text-sidebar-foreground/40">civsav ops</span>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Brand size={22} />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <MenuIcon className="size-4" />
            </Button>
          </div>
        </div>

        <main className="flex flex-1 flex-col">{children}</main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 gap-0 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Brand size={20} />
            </SheetTitle>
            <SheetDescription className="sr-only">Navigation</SheetDescription>
          </SheetHeader>
          <div className="p-3">
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
