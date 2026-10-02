"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, PlusIcon, SunMoonIcon, UserIcon, ZapIcon } from "lucide-react";
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
      <CommandInput placeholder="Search pages, clients and actions…" />
      <CommandList className="max-h-[min(60vh,26rem)]">
        <CommandEmpty>Nothing matches — try a client&apos;s name or a page.</CommandEmpty>

        <CommandGroup heading="Pages">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} value={`page ${item.label}`} onSelect={() => go(item.href)}>
              <item.icon className="size-4" aria-hidden />
              {item.label}
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
            >
              <UserIcon className="size-4" aria-hidden />
              <span className="flex-1 truncate">{client.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", STATUS_DOT[client.status].dot)} aria-hidden />
                {STATUS_DOT[client.status].label}
              </span>
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
            >
              <ZapIcon className="size-4" aria-hidden />
              Ask AI a question
            </CommandItem>
          )}
          <CommandItem value="action add new client" onSelect={() => go("/settings/clients/new")}>
            <PlusIcon className="size-4" aria-hidden />
            Add a client
          </CommandItem>
          <CommandItem value="action add api key gohighlevel openphone" onSelect={() => go("/settings/api-keys")}>
            <KeyRoundIcon className="size-4" aria-hidden />
            Add an API key
          </CommandItem>
          <CommandItem
            value="action toggle theme dark light"
            onSelect={() => {
              toggleTheme();
              onOpenChange(false);
            }}
          >
            <SunMoonIcon className="size-4" aria-hidden />
            Switch light / dark theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
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
