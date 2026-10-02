"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HeartPulseIcon, TrendingUpIcon } from "lucide-react";
import { setClientVisibility } from "@/app/settings/actions";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

type Field = "showOnDashboard" | "showOnSeo";

const OPTIONS: { field: Field; label: string; short: string; hint: string; icon: typeof HeartPulseIcon }[] = [
  {
    field: "showOnDashboard",
    label: "Health dashboard",
    short: "Health",
    hint: "Dashboard, Insights and the daily summary",
    icon: HeartPulseIcon,
  },
  {
    field: "showOnSeo",
    label: "SEO",
    short: "SEO",
    hint: "SEO page, monthly SEO summary and recommendations",
    icon: TrendingUpIcon,
  },
];

function useVisibility(clientId: string, clientName: string, initial: Record<Field, boolean>) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  // Pick up the saved values after a refresh from the server.
  useEffect(
    () => setValues({ showOnDashboard: initial.showOnDashboard, showOnSeo: initial.showOnSeo }),
    [initial.showOnDashboard, initial.showOnSeo],
  );

  function set(field: Field, value: boolean) {
    const label = OPTIONS.find((o) => o.field === field)!.label;
    setValues((v) => ({ ...v, [field]: value }));
    startTransition(async () => {
      const result = await setClientVisibility(clientId, field, value);
      if (result.error) {
        setValues((v) => ({ ...v, [field]: !value }));
        toast({ variant: "error", title: "Couldn't save that", description: result.error });
        return;
      }
      toast({
        variant: "success",
        title: value ? `${clientName} now shows on ${label}` : `${clientName} hidden from ${label}`,
        description: value ? undefined : "Numbers are still collected — switch it back on any time.",
      });
      router.refresh();
    });
  }
  return { values, pending, set };
}

// Card on the client page.
export function ClientVisibilityCard({
  clientId,
  clientName,
  showOnDashboard,
  showOnSeo,
}: {
  clientId: string;
  clientName: string;
  showOnDashboard: boolean;
  showOnSeo: boolean;
}) {
  const { values, pending, set } = useVisibility(clientId, clientName, { showOnDashboard, showOnSeo });
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-foreground">Shows on</h3>
        <p className="text-xs text-muted-foreground">Turn off what this client isn&apos;t signed up for. Numbers are kept either way.</p>
      </div>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const on = values[option.field];
          return (
            <label
              key={option.field}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted/40",
                !on && "bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              </span>
              <Switch
                checked={on}
                disabled={pending}
                onCheckedChange={(value) => set(option.field, value)}
                aria-label={`Show ${clientName} on ${option.label}`}
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}

// Two small toggle chips for the clients list, so many clients can be
// switched quickly without opening each one.
export function ClientVisibilityChips({
  clientId,
  clientName,
  showOnDashboard,
  showOnSeo,
  disabled = false,
}: {
  clientId: string;
  clientName: string;
  showOnDashboard: boolean;
  showOnSeo: boolean;
  disabled?: boolean;
}) {
  const { values, pending, set } = useVisibility(clientId, clientName, { showOnDashboard, showOnSeo });
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {OPTIONS.map((option) => {
        const on = values[option.field];
        const Icon = option.icon;
        return (
          <button
            key={option.field}
            type="button"
            aria-pressed={on}
            disabled={pending || disabled}
            onClick={() => set(option.field, !on)}
            title={`${on ? "Shown on" : "Hidden from"} ${option.label} — click to ${on ? "hide" : "show"}`}
            className={cn(
              "flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-60",
              on
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-dashed border-border text-muted-foreground/70 line-through decoration-muted-foreground/40 hover:bg-muted",
            )}
          >
            <Icon className="size-3" aria-hidden />
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
