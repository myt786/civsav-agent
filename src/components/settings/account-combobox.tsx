"use client";

import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiscoveredAccount } from "@/lib/connectors/types";
import { externalIdHints } from "@/lib/settings/validation";
import type { Platform } from "@/lib/connectors/types";
import { cn } from "@/lib/utils";

function humanizeLabel(label: string): string {
  return label
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export type DiscoveryState =
  | { status: "loading" }
  | { status: "ok"; accounts: DiscoveredAccount[] }
  | { status: "error"; error: string; accounts: DiscoveredAccount[] };

export function AccountCombobox({
  platform,
  name,
  value,
  onChange,
  discovery,
  suggestedId,
  disabled,
  credentialLabel = null,
  credentialLabelName,
  onCredentialLabelChange,
}: {
  platform: Platform;
  // When set, a hidden <input> mirrors value/onChange under this name so
  // the component drops straight into an existing <form action={...}>.
  name?: string;
  value: string;
  onChange: (value: string) => void;
  discovery: DiscoveryState;
  suggestedId?: string;
  disabled?: boolean;
  // Only meaningful for a platform whose accounts are split across
  // several per-tenant credentials (OpenPhone — see PlatformAccount.
  // credentialLabel). Ignored entirely when the discovered accounts never
  // set a credentialLabel, so every other platform is unaffected.
  credentialLabel?: string | null;
  credentialLabelName?: string;
  onCredentialLabelChange?: (label: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Manual entry is the only option once discovery has failed outright —
  // there's nothing to browse. Otherwise default to browsing so discovery
  // is the path most people take without an extra click.
  const [manual, setManual] = useState(discovery.status === "error" && discovery.accounts.length === 0);

  const accounts = discovery.status === "loading" ? [] : discovery.accounts;
  // id alone isn't unique when a platform's accounts are split across
  // several credentials (OpenPhone) and two of them return the same id —
  // e.g. two workspace keys that turn out to point at the same underlying
  // workspace — so the credentialLabel has to agree too.
  const selected = accounts.find((account) => account.id === value && (account.credentialLabel ?? null) === credentialLabel);
  const canBrowse = discovery.status !== "error" || accounts.length > 0;

  // Only surfaced once discovery has actually seen more than one
  // credential for this platform — a single-workspace OpenPhone setup (or
  // any other platform) never shows this.
  const workspaceLabels = [...new Set(accounts.map((a) => a.credentialLabel).filter((l): l is string => Boolean(l)))];

  return (
    <div className="flex flex-col gap-1">
      {name && <input type="hidden" name={name} value={value} />}
      {credentialLabelName && (
        <input type="hidden" name={credentialLabelName} value={credentialLabel ?? ""} />
      )}

      {manual ? (
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={externalIdHints[platform]}
            disabled={disabled}
            className="flex-1"
          />
          {workspaceLabels.length > 1 && (
            <Select
              value={credentialLabel ?? undefined}
              onValueChange={(label) => onCredentialLabelChange?.(label)}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaceLabels.map((label) => (
                  <SelectItem key={label} value={label}>
                    {humanizeLabel(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled || discovery.status === "loading"}
              className="w-full justify-between font-normal"
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                {discovery.status === "loading" && "Loading accounts…"}
                {discovery.status !== "loading" && selected && (
                  <>
                    <span className="truncate">
                      {selected.name} <span className="text-muted-foreground">({selected.id})</span>
                    </span>
                    {suggestedId === selected.id && (
                      <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                        <SparklesIcon className="size-3" />
                        suggested
                      </Badge>
                    )}
                  </>
                )}
                {discovery.status !== "loading" && !selected && value && (
                  <span className="truncate text-muted-foreground">{value}</span>
                )}
                {discovery.status !== "loading" && !selected && !value && (
                  <span className="text-muted-foreground">Search accounts…</span>
                )}
              </span>
              <ChevronsUpDownIcon className="shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
            <Command>
              <CommandInput placeholder="Search accounts…" />
              <CommandList>
                <CommandEmpty>No matching accounts.</CommandEmpty>
                <CommandGroup>
                  {accounts.map((account) => (
                    <CommandItem
                      // id alone isn't unique when a platform's accounts are
                      // split across several credentials (OpenPhone) and two
                      // of them happen to return the same id — e.g. two
                      // workspace keys that turn out to point at the same
                      // underlying workspace.
                      key={`${account.id}::${account.credentialLabel ?? ""}`}
                      value={`${account.name} ${account.id} ${account.credentialLabel ?? ""}`}
                      onSelect={() => {
                        onChange(account.id);
                        onCredentialLabelChange?.(account.credentialLabel ?? null);
                        setOpen(false);
                      }}
                    >
                      <CheckIcon className={cn(account === selected ? "opacity-100" : "opacity-0")} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">
                          {account.name} <span className="text-muted-foreground">({account.id})</span>
                        </span>
                        {account.extra && (
                          <span className="text-xs text-muted-foreground">{account.extra}</span>
                        )}
                      </div>
                      {suggestedId === account.id && (
                        <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
                          <SparklesIcon className="size-3" />
                          suggested
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {discovery.status === "error" ? (
          <p className="text-xs text-amber-700 dark:text-amber-500">{discovery.error}</p>
        ) : (
          <span />
        )}
        {canBrowse && (
          <button
            type="button"
            onClick={() => setManual((m) => !m)}
            className="text-xs whitespace-nowrap text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {manual ? "Choose from list" : "Enter ID manually"}
          </button>
        )}
      </div>
    </div>
  );
}
