"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeftIcon, KeyRoundIcon, PlusIcon, SearchXIcon, SunMoonIcon, UserIcon, ZapIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_ITEMS } from "@/components/app-shell";
import { getPaletteClients, type PaletteClient } from "@/app/nav-actions";
import { toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Shared look for every row: an icon tile, the label, and a hint on the
// right that turns into ↵ on the highlighted row.
const ITEM =
  "group h-11 gap-3 rounded-lg px-2.5 text-sm data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground";

function Tile({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "primary" }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors [&_svg]:size-3.5",
        tone === "primary"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground group-data-[selected=true]:bg-primary group-data-[selected=true]:text-primary-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="group-data-[selected=true]:hidden">{children}</span>
      <CornerDownLeftIcon className="hidden size-3.5 text-primary group-data-[selected=true]:block" aria-hidden />
    </span>
  );
}

const STATUS_DOT: Record<PaletteClient["status"], { dot: string; label: string }> = {
  active: { dot: "bg-success", label: "Active" },
  paused: { dot: "bg-muted-foreground/50", label: "Paused" },
  archived: { dot: "bg-muted-foreground/25", label: "Archived" },
};

// Cmd/Ctrl+K from any page: jump to a page, open a client by name, or run a
// common action. Controlled from AppShell so the keyboard shortcut and the
// sidebar's Quick jump button share one open state.
export function CommandPalette({
  open,
  onOpenChange,
  onAskAi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskAi?: () => void;
}) {
  const router = useRouter();
  const [clients, setClients] = useState<PaletteClient[] | null>(null);

  // Loaded the first time the palette opens, then kept for the session.
  useEffect(() => {
    if (!open || clients !== null) return;
    let cancelled = false;
    getPaletteClients()
      .then((rows) => {
        if (!cancelled) setClients(rows);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clients]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const liveClients = (clients ?? []).filter((c) => c.status !== "archived");

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search clients, pages or actions…" className="h-14 text-base" />
      <CommandList className="max-h-[min(60vh,28rem)] px-1.5 pb-1.5">
        <CommandEmpty>
          <span className="flex flex-col items-center gap-2 py-4">
            <SearchXIcon className="size-6 text-muted-foreground/60" aria-hidden />
            <span>Nothing matches — try part of a client&apos;s name or a page.</span>
          </span>
        </CommandEmpty>

        <CommandGroup heading="Pages">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} value={`page ${item.label}`} onSelect={() => go(item.href)} className={ITEM}>
              <Tile>
                <item.icon aria-hidden />
              </Tile>
              <span className="truncate">{item.label}</span>
              <Hint>Page</Hint>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading={clients === null ? "Clients (loading…)" : `Clients · ${liveClients.length}`}>
          {liveClients.map((client) => (
            <CommandItem
              key={client.id}
              value={`client ${client.name}`}
              onSelect={() => go(`/settings/clients/${client.id}`)}
              className={ITEM}
            >
              <Tile>
                <UserIcon aria-hidden />
              </Tile>
              <span className="truncate">{client.name}</span>
              <Hint>
                <span className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", STATUS_DOT[client.status].dot)} aria-hidden />
                  {STATUS_DOT[client.status].label}
                </span>
              </Hint>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          {onAskAi && (
            <CommandItem
              value="action ask ai question assistant"
              onSelect={() => {
                onOpenChange(false);
                onAskAi();
              }}
              className={ITEM}
            >
              <Tile tone="primary">
                <ZapIcon aria-hidden />
              </Tile>
              Ask AI a question
              <Hint>AI</Hint>
            </CommandItem>
          )}
          <CommandItem value="action add new client" onSelect={() => go("/settings/clients/new")} className={ITEM}>
            <Tile>
              <PlusIcon aria-hidden />
            </Tile>
            Add a client
            <Hint>Action</Hint>
          </CommandItem>
          <CommandItem value="action add api key gohighlevel openphone" onSelect={() => go("/settings/api-keys")} className={ITEM}>
            <Tile>
              <KeyRoundIcon aria-hidden />
            </Tile>
            Add an API key
            <Hint>Action</Hint>
          </CommandItem>
          <CommandItem
            value="action toggle theme dark light"
            onSelect={() => {
              toggleTheme();
              onOpenChange(false);
            }}
            className={ITEM}
          >
            <Tile>
              <SunMoonIcon aria-hidden />
            </Tile>
            Switch light / dark theme
            <Hint>Action</Hint>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span>
            <kbd className="rounded border border-border bg-card px-1 font-mono">↑</kbd>{" "}
            <kbd className="rounded border border-border bg-card px-1 font-mono">↓</kbd> to move
          </span>
          <span>
            <kbd className="rounded border border-border bg-card px-1 font-mono">↵</kbd> to open
          </span>
        </span>
        <span>
          <kbd className="rounded border border-border bg-card px-1 font-mono">esc</kbd> to close
        </span>
      </div>
    </CommandDialog>
  );
}
