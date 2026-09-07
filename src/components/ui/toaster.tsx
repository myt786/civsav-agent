"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { CheckCircle2Icon, InfoIcon, XCircleIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "error";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

// Module-scoped pub/sub instead of React context — toast() needs to be
// callable from any client component (button handlers, effects) without
// every caller needing to be inside a <ToastProvider> subtree or reach for
// a hook. <Toaster/> below is the single subscriber that renders the list.
let toasts: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function toast(options: { title: string; description?: string; variant?: ToastVariant }) {
  const id = ++nextId;
  toasts = [...toasts, { id, variant: options.variant ?? "default", title: options.title, description: options.description }];
  notify();
  return id;
}

function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

function useToasts() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => toasts,
    () => [] as ToastItem[],
  );
}

const VARIANT_ICON: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  default: InfoIcon,
  success: CheckCircle2Icon,
  error: XCircleIcon,
};

export function Toaster() {
  const items = useToasts();

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {items.map((item) => {
        const Icon = VARIANT_ICON[item.variant];
        return (
          <ToastPrimitive.Root
            key={item.id}
            onOpenChange={(open) => {
              if (!open) dismissToast(item.id);
            }}
            className={cn(
              "relative flex items-start gap-2.5 rounded-lg border border-border bg-popover p-3 pr-8 text-popover-foreground shadow-lg",
              "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=open]:fade-in-0",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
              "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:animate-out",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                item.variant === "success" && "text-emerald-600 dark:text-emerald-500",
                item.variant === "error" && "text-destructive",
                item.variant === "default" && "text-muted-foreground",
              )}
            />
            <div className="flex flex-col gap-0.5">
              <ToastPrimitive.Title className="text-sm font-medium text-foreground">{item.title}</ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="text-xs text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <XIcon className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed right-0 bottom-0 z-100 flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </ToastPrimitive.Provider>
  );
}
