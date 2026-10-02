"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailIcon,
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  SparklesIcon,
  TrendingUpIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { AssistantChat } from "@/components/assistant-chat";
import { getNavSummary, type NavSummary } from "@/app/nav-actions";
import { logout } from "@/app/settings/login/actions";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { STALE_HOURS } from "@/lib/dashboard/constants";
import { cn } from "@/lib/utils";

type BadgeKey = "attention" | "brokenAccounts";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboardIcon;
  badge?: BadgeKey;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
      { href: "/seo", label: "SEO", icon: TrendingUpIcon },
      { href: "/insights", label: "Insights", icon: SparklesIcon, badge: "attention" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/settings/clients", label: "Clients", icon: UsersIcon, badge: "brokenAccounts" },
      { href: "/settings/api-keys", label: "API keys", icon: KeyRoundIcon },
      { href: "/settings/email-reports", label: "Email reports", icon: MailIcon },
    ],
  },
  {
    label: "Support",
    items: [{ href: "/docs", label: "Help", icon: BookOpenIcon }],
  },
];

// Kept for anything that wants the flat list (e.g. the command palette).
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const BADGE_STYLE: Record<BadgeKey, { className: string; title: (n: number) => string }> = {
  attention: {
    className: "bg-warning/15 text-warning",
    title: (n) => `${n} ${n === 1 ? "client needs" : "clients need"} a look`,
  },
  brokenAccounts: {
    className: "bg-destructive/15 text-destructive",
    title: (n) => `${n} ${n === 1 ? "account isn't" : "accounts aren't"} working`,
  },
};

const COLLAPSE_KEY = "civsav:sidebar-collapsed";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ size = 24, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <>
      <Image src="/civsav-icon.png" alt="" width={size} height={size} className="shrink-0 rounded-md" priority />
      {showName && <span className="font-heading text-sm font-semibold text-sidebar-foreground">civsav</span>}
    </>
  );
}

function NavLinks({
  pathname,
  summary,
  collapsed = false,
  onNavigate,
}: {
  pathname: string;
  summary: NavSummary | null;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {collapsed ? (
            <span className="mx-auto mb-1 h-px w-6 bg-sidebar-border" aria-hidden />
          ) : (
            <span className="mb-1 px-2.5 text-[11px] font-medium tracking-wide text-sidebar-foreground/45 uppercase">
              {group.label}
            </span>
          )}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const count = item.badge && summary ? summary[item.badge] : 0;
            const badge = item.badge && count > 0 ? BADGE_STYLE[item.badge] : null;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? (badge ? `${item.label} — ${badge.title(count)}` : item.label) : badge?.title(count)}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-0" : "px-2.5",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                {active && !collapsed && (
                  <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary" aria-hidden />
                )}
                <Icon className="size-4 shrink-0" aria-hidden />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {badge &&
                  (collapsed ? (
                    <span
                      className={cn("absolute top-1 right-2 size-2 rounded-full", item.badge === "attention" ? "bg-warning" : "bg-destructive")}
                      aria-label={badge.title(count)}
                    />
                  ) : (
                    <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums", badge.className)}>
                      {count}
                    </span>
                  ))}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// "Data updated 3h ago" with a dot: green when the last daily update went
// through cleanly, amber when some accounts failed, red when it failed.
function DataStatus({ summary, collapsed }: { summary: NavSummary | null; collapsed: boolean }) {
  if (!summary?.lastRunAt) return null;
  const at = new Date(summary.lastRunAt);
  const hoursAgo = (Date.now() - at.getTime()) / 3_600_000;
  const tone =
    hoursAgo > STALE_HOURS && summary.lastRunStatus !== "running"
      ? { dot: "bg-warning", text: "Not updated recently" }
      : summary.lastRunStatus === "failed"
      ? { dot: "bg-destructive", text: "Last update failed" }
      : summary.lastRunStatus === "completed_with_errors"
        ? { dot: "bg-warning", text: "Updated with some errors" }
        : summary.lastRunStatus === "running"
          ? { dot: "bg-primary animate-pulse", text: "Updating now…" }
          : { dot: "bg-success", text: "Data up to date" };
  const when = formatRelativeTime(at, new Date());
  return (
    <Link
      href="/insights"
      title={`${tone.text} · ${when}`}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sidebar-foreground/80">{tone.text}</span>
          <span className="truncate">{when}</span>
        </span>
      )}
    </Link>
  );
}

function initialsOf(email: string | null) {
  if (!email) return "·";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

function UserFooter({ summary, collapsed }: { summary: NavSummary | null; collapsed: boolean }) {
  const email = summary?.email ?? null;
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <ThemeToggle />
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title={email ? `Sign out ${email}` : "Sign out"}>
            <LogOutIcon className="size-4" />
          </Button>
        </form>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-sidebar-border px-2 py-1.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-[11px] font-semibold text-sidebar-primary">
        {initialsOf(email)}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/75" title={email ?? undefined}>
        {email ?? "civsav ops"}
      </span>
      <ThemeToggle />
      <form action={logout}>
        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out">
          <LogOutIcon className="size-4" />
        </Button>
      </form>
    </div>
  );
}

// Persistent left sidebar on desktop, a slide-out sheet from a top bar on
// mobile — one shared shell so every top-level page (dashboard, insights,
// settings, docs) gets the same nav instead of re-declaring its own strip.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [summary, setSummary] = useState<NavSummary | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Remembered per browser; storage can be unavailable (private mode).
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Keep the default.
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Not remembered, still works.
      }
      return next;
    });
  }

  // Badges refresh when moving between pages, after the page itself loads —
  // at most once a minute, since the attention count runs the dashboard query.
  const lastSummaryAt = useRef(0);
  useEffect(() => {
    if (Date.now() - lastSummaryAt.current < 60_000) return;
    lastSummaryAt.current = Date.now();
    let cancelled = false;
    getNavSummary()
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar py-4 transition-[width] duration-200 md:flex",
          collapsed ? "w-16 px-2" : "w-60 px-3",
        )}
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "justify-between gap-2")}>
            <Link href="/" className={cn("flex items-center gap-2", !collapsed && "px-1.5")} title="civsav">
              <Brand showName={!collapsed} />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="text-sidebar-foreground/50 hover:text-sidebar-foreground"
            >
              {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
            </Button>
          </div>

          <div className={cn("flex gap-1.5", collapsed ? "flex-col items-center" : "flex-col")}>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Quick jump (⌘K)"
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border border-sidebar-border text-left text-xs text-sidebar-foreground/50 transition-colors hover:border-sidebar-ring/40 hover:text-sidebar-foreground/80",
                collapsed ? "size-9 justify-center" : "px-2.5 py-1.5",
              )}
            >
              <span className="flex items-center gap-1.5">
                <SearchIcon className="size-3.5" aria-hidden />
                {!collapsed && "Quick jump"}
              </span>
              {!collapsed && <kbd className="rounded border border-sidebar-border px-1 font-mono text-[10px]">⌘K</kbd>}
            </button>
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              title="Ask a question about your clients"
              className={cn(
                "flex items-center gap-1.5 rounded-lg bg-sidebar-primary/10 text-xs font-medium text-sidebar-primary transition-colors hover:bg-sidebar-primary/15",
                collapsed ? "size-9 justify-center" : "px-2.5 py-1.5",
              )}
            >
              <ZapIcon className="size-3.5" aria-hidden />
              {!collapsed && "Ask AI"}
            </button>
          </div>

          <NavLinks pathname={pathname} summary={summary} collapsed={collapsed} />
        </div>

        <div className="flex flex-col gap-2 pt-3">
          <DataStatus summary={summary} collapsed={collapsed} />
          <UserFooter summary={summary} collapsed={collapsed} />
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
              onClick={() => setAssistantOpen(true)}
              aria-label="Ask the assistant"
            >
              <SparklesIcon className="size-4" />
            </Button>
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

        <main className="relative flex flex-1 flex-col">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72"
            style={{
              background: "radial-gradient(60% 100% at 50% 0%, color-mix(in oklch, var(--primary), transparent 92%), transparent)",
            }}
            aria-hidden
          />
          {children}
        </main>
      </div>

      <button
        type="button"
        onClick={() => setAssistantOpen(true)}
        aria-label="Ask the assistant"
        className="fixed top-4 right-4 z-40 hidden size-10 items-center justify-center rounded-full border border-border bg-card text-primary shadow-md transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg md:flex"
      >
        <SparklesIcon className="size-4" aria-hidden />
      </button>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Brand size={20} />
            </SheetTitle>
            <SheetDescription className="sr-only">Navigation</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col justify-between gap-4 p-3">
            <NavLinks pathname={pathname} summary={summary} onNavigate={() => setMobileOpen(false)} />
            <div className="flex flex-col gap-2">
              <DataStatus summary={summary} collapsed={false} />
              <UserFooter summary={summary} collapsed={false} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <AssistantChat open={assistantOpen} onOpenChange={setAssistantOpen} />
    </div>
  );
}
