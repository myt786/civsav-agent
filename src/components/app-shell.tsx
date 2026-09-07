"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  LayoutDashboardIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  MessageCircleIcon,
  ListFilterIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";
import { AssistantChat } from "@/components/assistant-chat";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/insights", label: "Insights", icon: ListFilterIcon },
  { href: "/settings/clients", label: "Settings", icon: SettingsIcon },
  { href: "/docs", label: "Help", icon: BookOpenIcon },
];
function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <Image
        src="/civsav-icon.png"
        alt=""
        width={29}
        height={29}
        priority
        className="rounded-lg"
      />
      <span className="text-[23px] font-semibold tracking-[-0.065em]">
        civsav<span className="text-primary">.</span>
      </span>
    </Link>
  );
}
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
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
  const navigation = (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/" || pathname.startsWith("/clients/")
            : pathname.startsWith(
                item.href === "/settings/clients" ? "/settings" : item.href,
              );
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="size-4" strokeWidth={1.7} aria-hidden />
            {item.label}
            {active && (
              <span className="ml-auto size-1.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <TooltipProvider>
      <div className="flex min-h-dvh w-full">
        <a
          href="#main-content"
          className="fixed left-4 top-3 z-50 -translate-y-20 rounded-md bg-card px-4 py-2 focus:translate-y-0"
        >
          Skip to content
        </a>
        <aside className="sticky top-0 hidden h-dvh w-[216px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-7 md:flex">
          <Brand />
          <div className="mb-8 mt-6 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-white/60 px-3 py-3">
            <span className="flex size-7 items-center justify-center rounded-md bg-[#dfe3d5] text-[10px] font-semibold">
              C
            </span>
            <div>
              <p className="text-xs font-semibold">Agency workspace</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Client health & performance
              </p>
            </div>
          </div>
          <p className="eyebrow mb-3 px-3">Workspace</p>
          {navigation}
          <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-4">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-muted-foreground hover:bg-sidebar-accent"
            >
              <SearchIcon className="size-4" />
              Quick navigation<kbd className="ml-auto text-[10px]">Ctrl K</kbd>
            </button>
            <button
              onClick={() => setAssistantOpen(true)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium hover:bg-sidebar-accent"
            >
              <MessageCircleIcon className="size-4" />
              Ask the assistant
              <ArrowUpRightIcon className="ml-auto size-3.5 text-muted-foreground" />
            </button>
            <p className="mt-5 px-3 text-[10px] text-muted-foreground">
              A clearer view of every client.
            </p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-16 items-center justify-between border-b border-border bg-card px-4 md:hidden">
            <Brand />
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Ask the assistant"
                onClick={() => setAssistantOpen(true)}
              >
                <MessageCircleIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                onClick={() => setMobileOpen(true)}
              >
                <MenuIcon className="size-5" />
              </Button>
            </div>
          </div>
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 outline-none"
          >
            {children}
          </main>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 bg-sidebar">
            <SheetHeader>
              <SheetTitle>Civsav workspace</SheetTitle>
              <SheetDescription>Client health and performance</SheetDescription>
            </SheetHeader>
            <div className="p-4">{navigation}</div>
          </SheetContent>
        </Sheet>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <AssistantChat open={assistantOpen} onOpenChange={setAssistantOpen} />
      </div>
    </TooltipProvider>
  );
}
