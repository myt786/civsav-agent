"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailIcon,
  MenuIcon,
  SearchIcon,
  SparklesIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

const BADGE_STYLE: Record<BadgeKey, { pill: string; solid: string; title: (n: number) => string }> = {
  attention: {
    pill: "bg-warning/15 text-warning",
    solid: "bg-warning text-white",
    title: (n) => `${n} ${n === 1 ? "client needs" : "clients need"} a look`,
  },
  brokenAccounts: {
    pill: "bg-destructive/15 text-destructive",
    solid: "bg-destructive text-white",
    title: (n) => `${n} ${n === 1 ? "account isn't" : "accounts aren't"} working`,
  },
};

const COLLAPSE_KEY = "civsav:sidebar-collapsed";

// One size for every clickable row, so the expanded list and the collapsed
// icon rail line up exactly.
const ROW = "flex h-9 items-center gap-2.5 rounded-lg text-sm transition-colors";
const ROW_IDLE = "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// A tooltip to the right of an icon, only when the sidebar is collapsed and
// the label isn't visible.
function RailTip({ show, label, children }: { show: boolean; label: string; children: ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function Brand({ size = 26, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <>
      <Image src="/civsav-icon.png" alt="" width={size} height={size} className="shrink-0 rounded-md" priority />
      {showName && <span className="font-heading text-[15px] font-semibold tracking-tight text-sidebar-foreground">civsav</span>}
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
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {!collapsed && (
            <span className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
              {group.label}
            </span>
          )}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const count = item.badge && summary ? summary[item.badge] : 0;
            const badge = item.badge && count > 0 ? BADGE_STYLE[item.badge] : null;
            const tip = badge ? `${item.label} · ${badge.title(count)}` : item.label;
            return (
              <RailTip key={item.href} show={collapsed} label={tip}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? tip : undefined}
                  title={!collapsed && badge ? badge.title(count) : undefined}
                  className={cn(
                    ROW,
                    "relative",
                    collapsed ? "mx-auto w-10 justify-center" : "px-3",
                    active
                      ? "bg-sidebar-primary/10 font-medium text-sidebar-primary"
                      : ROW_IDLE,
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {badge &&
                    (collapsed ? (
                      <span
                        className={cn(
                          "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums ring-2 ring-sidebar",
                          badge.solid,
                        )}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : (
                      <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums", badge.pill)}>
                        {count}
                      </span>
                    ))}
                </Link>
              </RailTip>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function dataStatusOf(summary: NavSummary | null) {
  if (!summary?.lastRunAt) return null;
  const at = new Date(summary.lastRunAt);
  const hoursAgo = (Date.now() - at.getTime()) / 3_600_000;
  const tone =
    summary.lastRunStatus === "running"
      ? { dot: "bg-primary animate-pulse", text: "Updating now…" }
      : hoursAgo > STALE_HOURS
        ? { dot: "bg-warning", text: "Not updated recently" }
        : summary.lastRunStatus === "failed"
          ? { dot: "bg-destructive", text: "Last update failed" }
          : summary.lastRunStatus === "completed_with_errors"
            ? { dot: "bg-warning", text: "Updated with some errors" }
            : { dot: "bg-success", text: "Data up to date" };
  return { ...tone, when: formatRelativeTime(at, new Date()) };
}

// "Data up to date · 3 hours ago": green clean, amber with errors or stale,
// red failed. Links to Insights, where any problems are listed.
function DataStatus({ summary, collapsed }: { summary: NavSummary | null; collapsed: boolean }) {
  const status = dataStatusOf(summary);
  if (!status) return null;
  const label = `${status.text} · ${status.when}`;
  return (
    <RailTip show={collapsed} label={label}>
      <Link
        href="/insights"
        aria-label={collapsed ? label : undefined}
        className={cn(ROW, ROW_IDLE, "text-xs", collapsed ? "mx-auto w-10 justify-center" : "px-3")}
      >
        <span className="relative flex size-[18px] shrink-0 items-center justify-center">
          <span className={cn("size-2 rounded-full", status.dot)} aria-hidden />
        </span>
        {!collapsed && (
          <span className="min-w-0 truncate">
            <span className="text-sidebar-foreground/85">{status.text}</span>
            <span className="text-sidebar-foreground/50"> · {status.when}</span>
          </span>
        )}
      </Link>
    </RailTip>
  );
}

function initialsOf(email: string | null) {
  if (!email) return "·";
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

function SidebarFooter({
  summary,
  collapsed,
  onToggleCollapsed,
}: {
  summary: NavSummary | null;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}) {
  const email = summary?.email ?? null;
  return (
    <div className="flex flex-col gap-1 border-t border-sidebar-border pt-3">
      <DataStatus summary={summary} collapsed={collapsed} />

      {collapsed ? (
        <div className="flex flex-col items-center gap-1">
          <RailTip show label={email ? `Signed in as ${email}` : "Signed in"}>
            <span className="flex size-9 items-center justify-center rounded-full bg-sidebar-primary/15 text-[11px] font-semibold text-sidebar-primary">
              {initialsOf(email)}
            </span>
          </RailTip>
          <RailTip show label="Switch theme">
            <span>
              <ThemeToggle />
            </span>
          </RailTip>
          <form action={logout}>
            <RailTip show label="Sign out">
              <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
                <LogOutIcon className="size-4" />
              </Button>
            </RailTip>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-[11px] font-semibold text-sidebar-primary">
            {initialsOf(email)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-xs font-medium text-sidebar-foreground" title={email ?? undefined}>
              {email ? email.split("@")[0] : "civsav ops"}
            </span>
            <span className="truncate text-[11px] text-sidebar-foreground/50">{email ? `@${email.split("@")[1]}` : ""}</span>
          </span>
          <ThemeToggle />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out">
              <LogOutIcon className="size-4" />
            </Button>
          </form>
        </div>
      )}

      {onToggleCollapsed && (
        <RailTip show={collapsed} label="Expand sidebar">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(ROW, ROW_IDLE, "text-xs", collapsed ? "mx-auto w-10 justify-center" : "px-3")}
          >
            {collapsed ? <ChevronsRightIcon className="size-[18px]" /> : <ChevronsLeftIcon className="size-[18px]" />}
            {!collapsed && "Collapse"}
          </button>
        </RailTip>
      )}
    </div>
  );
}

// Persistent left sidebar on desktop (collapsible to an icon rail), a
// slide-out sheet from a top bar on mobile — one shared shell so every
// top-level page gets the same navigation.
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
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen w-full">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-4 transition-[width] duration-200 md:flex",
            collapsed ? "w-[68px] px-2" : "w-60 px-3",
          )}
        >
          <Link
            href="/"
            className={cn("mb-4 flex h-9 items-center gap-2.5", collapsed ? "justify-center" : "px-2")}
            aria-label="civsav home"
          >
            <Brand showName={!collapsed} />
          </Link>

          {/* Search and the assistant share one row: search fills it, the
              assistant is a single icon so it never reads as a selected page. */}
          <div className={cn("mb-5 flex gap-1.5", collapsed && "flex-col items-center")}>
            <RailTip show={collapsed} label="Quick jump (⌘K)">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Quick jump"
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/30 text-xs text-sidebar-foreground/55 transition-colors hover:border-sidebar-ring/40 hover:text-sidebar-foreground",
                  collapsed ? "w-10 justify-center" : "min-w-0 flex-1 px-2.5",
                )}
              >
                <SearchIcon className="size-4 shrink-0" aria-hidden />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-left">Search…</span>
                    <kbd className="rounded border border-sidebar-border bg-sidebar px-1 font-mono text-[10px]">⌘K</kbd>
                  </>
                )}
              </button>
            </RailTip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setAssistantOpen(true)}
                  aria-label="Ask AI"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sidebar-border text-sidebar-primary transition-colors hover:border-sidebar-primary/40 hover:bg-sidebar-primary/10"
                >
                  <SparklesIcon className="size-4" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side={collapsed ? "right" : "bottom"} sideOffset={8}>
                Ask AI about your clients
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavLinks pathname={pathname} summary={summary} collapsed={collapsed} />
          </div>

          <SidebarFooter summary={summary} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
            <Link href="/" className="flex items-center gap-2">
              <Brand size={22} />
            </Link>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPaletteOpen(true)} aria-label="Search">
                <SearchIcon className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAssistantOpen(true)} aria-label="Ask AI">
                <SparklesIcon className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
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

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-sidebar p-0">
            <SheetHeader className="border-b border-sidebar-border">
              <SheetTitle className="flex items-center gap-2">
                <Brand size={22} />
              </SheetTitle>
              <SheetDescription className="sr-only">Navigation</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col justify-between gap-4 overflow-y-auto p-3">
              <NavLinks pathname={pathname} summary={summary} onNavigate={() => setMobileOpen(false)} />
              <SidebarFooter summary={summary} collapsed={false} />
            </div>
          </SheetContent>
        </Sheet>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onAskAi={() => setAssistantOpen(true)} />
        <AssistantChat open={assistantOpen} onOpenChange={setAssistantOpen} />
      </div>
    </TooltipProvider>
  );
}
