"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  // Draws the count in warning colours while it's above zero (e.g. "Needs
  // attention 14"), so a problem is visible without selecting the tab.
  alert?: boolean;
}

// "Pick one" filter used above the dashboard table and the Settings client
// list. The selected option is a solid primary pill so it reads at a glance
// on any background — a white-on-grey pill was too faint to spot.
export function SegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-lg border border-border bg-card p-1 shadow-sm",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const alert = option.alert && (option.count ?? 0) > 0;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm whitespace-nowrap transition-colors",
              selected
                ? "bg-primary font-medium text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
                  selected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : alert
                      ? "bg-warning/15 font-medium text-warning"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
