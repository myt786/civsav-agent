"use client";

import { useRouter } from "next/navigation";
import { SunMoonIcon } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NAV_ITEMS } from "@/components/app-shell";
import { toggleTheme } from "@/lib/theme";

// Cmd/Ctrl+K quick-nav, available on every shell page. Kept deliberately
// small — page navigation and the theme toggle, both already reachable
// from the sidebar — rather than surfacing server actions (Sync now,
// Verify) here, which would need per-page wiring this palette doesn't have.
// Controlled from AppShell so the same open/close state serves both the
// global keyboard shortcut and the sidebar's search button.
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Preferences">
          <CommandItem
            value="Toggle theme"
            onSelect={() => {
              toggleTheme();
              onOpenChange(false);
            }}
          >
            <SunMoonIcon className="size-4" aria-hidden />
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
