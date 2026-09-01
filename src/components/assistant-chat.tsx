"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChatPanel } from "@/components/insights/chat-panel";

// The assistant chat, right-docked and reachable from every shell page (see
// the trigger icons in AppShell) — same pattern as Stripe/Shopify's help
// panel: one persistent slide-out rather than a chat embedded per-page.
// Controlled from AppShell, same as CommandPalette, so the same open state
// serves both the floating desktop icon and the mobile top-bar icon.
export function AssistantChat({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="sr-only">
          <SheetTitle>Ask about your clients</SheetTitle>
          <SheetDescription>Chat assistant grounded in the same live data as the dashboard.</SheetDescription>
        </SheetHeader>
        <ChatPanel />
      </SheetContent>
    </Sheet>
  );
}
