"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon, CheckCheckIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { deactivateClient, reactivateClient, unarchiveClient, verifyAllMappings } from "@/app/settings/actions";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PLATFORM_LABELS, PLATFORM_ORDER } from "@/lib/connectors/platform-labels";
import type { Platform } from "@/lib/connectors/types";
import { friendlyError } from "@/lib/friendly-error";
import { cn } from "@/lib/utils";

interface ClientAccount {
  platform: Platform;
  active: boolean;
  verifiedAt: Date | null;
  verifiedStatus: "ok" | "no_data" | "error" | null;
  lastError: string | null;
}

interface ClientListItem {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  archived: boolean;
  accounts: ClientAccount[];
  lastUpdatedAt: Date | null;
}

type AccountState = "working" | "quiet" | "broken" | "unchecked" | "paused";

function accountState(account: ClientAccount): AccountState {
  if (!account.active) return "paused";
  if (!account.verifiedAt) return "unchecked";
  if (account.verifiedStatus === "error") return "broken";
  if (account.verifiedStatus === "no_data") return "quiet";
  return "working";
}

// Working accounts are deliberately plain (the Health column already says
// "All working"); only accounts that need a look carry colour, so problems
// stand out instead of every chip competing for attention.
const STATE_STYLE: Record<AccountState, { chip: string; label: string }> = {
  working: { chip: "bg-muted text-foreground/75", label: "Working" },
  quiet: { chip: "bg-warning/10 text-warning", label: "No recent activity" },
  broken: { chip: "bg-destructive/10 font-medium text-destructive", label: "Not working" },
  unchecked: { chip: "border border-dashed border-muted-foreground/40 text-muted-foreground", label: "Not checked yet" },
  paused: { chip: "bg-muted/50 text-muted-foreground/60", label: "Updates paused" },
};

function Chip({ state, children }: { state: AccountState; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-5 whitespace-nowrap",
        STATE_STYLE[state].chip,
      )}
    >
      {state === "broken" && <AlertTriangleIcon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}

// Short names so a client with every platform still fits on one line.
const SHORT_LABEL: Record<Platform, string> = {
  lead_dashboard: "Leads",
  ghl: "GoHighLevel",
  google_ads: "Google Ads",
  meta: "Meta",
  ga4: "GA4",
  search_console: "Search Console",
  ahrefs: "Ahrefs",
  openphone: "OpenPhone",
};

type StatusFilter = "all" | "attention" | "unchecked" | "none" | "paused" | "archived";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "unchecked", label: "Not checked" },
  { value: "none", label: "No accounts" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

function needsAttention(client: ClientListItem) {
  return client.active && client.accounts.some((a) => accountState(a) === "broken");
}
function hasUnchecked(client: ClientListItem) {
  return client.active && client.accounts.some((a) => accountState(a) === "unchecked");
}

function matchesStatus(client: ClientListItem, filter: StatusFilter) {
  // Archived clients only appear under their own filter.
  if (filter === "archived") return client.archived;
  if (client.archived) return false;
  if (filter === "attention") return needsAttention(client);
  if (filter === "unchecked") return hasUnchecked(client);
  if (filter === "none") return client.accounts.length === 0;
  if (filter === "paused") return !client.active;
  return true;
}

interface Health {
  label: string;
  tone: "good" | "warn" | "bad" | "muted";
  // Lower sorts first: problems at the top when sorting by health.
  rank: number;
}

function healthOf(client: ClientListItem): Health {
  if (client.archived) return { label: "Archived", tone: "muted", rank: 5 };
  if (!client.active) return { label: "Paused", tone: "muted", rank: 4 };
  if (client.accounts.length === 0) return { label: "No accounts yet", tone: "warn", rank: 1 };
  const states = client.accounts.map(accountState);
  const broken = states.filter((s) => s === "broken").length;
  const unchecked = states.filter((s) => s === "unchecked").length;
  if (broken > 0) return { label: `${broken} not working`, tone: "bad", rank: 0 };
  if (unchecked > 0) return { label: `${unchecked} not checked`, tone: "warn", rank: 2 };
  return { label: "All working", tone: "good", rank: 3 };
}

const HEALTH_TONE: Record<Health["tone"], string> = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive font-medium",
  muted: "text-muted-foreground",
};

type SortKey = "name" | "health" | "updated";

// "any" | "has:<platform>" | "missing:<platform>"
function matchesPlatform(client: ClientListItem, filter: string) {
  if (filter === "any") return true;
  const [mode, platform] = filter.split(":");
  const has = client.accounts.some((a) => a.platform === platform);
  return mode === "has" ? has : !has;
}

export function ClientsList({ clients }: { clients: ClientListItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [platform, setPlatform] = useState("any");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const now = useMemo(() => new Date(), []);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const counts = useMemo(
    () => {
      const live = clients.filter((c) => !c.archived);
      return {
        all: live.length,
        attention: live.filter(needsAttention).length,
        unchecked: live.filter(hasUnchecked).length,
        none: live.filter((c) => c.accounts.length === 0).length,
        paused: live.filter((c) => !c.active).length,
        archived: clients.length - live.length,
      };
    },
    [clients],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = clients.filter(
      (c) => (!q || c.name.toLowerCase().includes(q)) && matchesStatus(c, status) && matchesPlatform(c, platform),
    );
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "health") {
        const diff = healthOf(a).rank - healthOf(b).rank;
        if (diff !== 0) return diff * factor;
      } else if (sort.key === "updated") {
        // "asc" = most recently updated first; never-updated last.
        const at = a.lastUpdatedAt?.getTime() ?? -Infinity;
        const bt = b.lastUpdatedAt?.getTime() ?? -Infinity;
        if (at !== bt) return (bt - at) * factor;
      }
      return a.name.localeCompare(b.name) * (sort.key === "name" ? factor : 1);
    });
  }, [clients, query, status, platform, sort]);

  const filtersActive = query.trim() !== "" || status !== "all" || platform !== "any";

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
        {clients.length > 0 && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* One segmented control instead of a row of outlined pills —
                lighter, and it reads as "pick one". Scrolls sideways on
                narrow screens rather than wrapping onto two lines. */}
            <div
              className="flex h-9 max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-lg bg-muted p-0.5"
              role="radiogroup"
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.filter((f) => f.value !== "archived" || counts.archived > 0 || status === "archived").map(
                (f) => {
                  const selected = status === f.value;
                  const alert = f.value === "attention" && counts.attention > 0;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setStatus(f.value)}
                      className={cn(
                        "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
                        selected
                          ? "bg-background font-medium text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f.label}
                      <span
                        className={cn(
                          "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
                          alert
                            ? "bg-destructive/10 font-medium text-destructive"
                            : selected
                              ? "bg-muted text-muted-foreground"
                              : "text-muted-foreground/80",
                        )}
                      >
                        {counts[f.value]}
                      </span>
                    </button>
                  );
                },
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-full bg-card data-[size=default]:h-9 sm:w-48" aria-label="Filter by platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any platform</SelectItem>
                  {PLATFORM_ORDER.map((p) => (
                    <SelectItem key={`has:${p}`} value={`has:${p}`}>
                      Has {PLATFORM_LABELS[p]}
                    </SelectItem>
                  ))}
                  {PLATFORM_ORDER.map((p) => (
                    <SelectItem key={`missing:${p}`} value={`missing:${p}`}>
                      Missing {PLATFORM_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-60">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients…"
                  className="h-9 bg-card pl-8"
                  aria-label="Search clients"
                />
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead label="Client" sortKey="name" sort={sort} onSort={toggleSort} className="w-[24%]" />
                <TableHead>Connected accounts</TableHead>
                <SortHead label="Health" sortKey="health" sort={sort} onSort={toggleSort} className="w-36" />
                <SortHead label="Last updated" sortKey="updated" sort={sort} onSort={toggleSort} className="w-32" />
                <TableHead className="w-1 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <ClientRow key={client.id} client={client} now={now} onOpen={() => router.push(`/settings/clients/${client.id}`)} />
              ))}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No clients yet — click &ldquo;Add client&rdquo; to add your first one.
                  </TableCell>
                </TableRow>
              )}
              {clients.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No clients match these filters.{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        setQuery("");
                        setStatus("all");
                        setPlatform("any");
                      }}
                    >
                      Clear filters
                    </button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {filtersActive ? `Showing ${filtered.length} of ${counts.all} clients` : `${counts.all} clients`} ·
            click a client to manage its accounts
          </span>
          <span className="flex flex-wrap items-center gap-3">
            {(["working", "quiet", "broken", "unchecked"] as const).map((state) => (
              <Chip key={state} state={state}>
                {STATE_STYLE[state].label}
              </Chip>
            ))}
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}

function AccountBadges({ accounts }: { accounts: ClientAccount[] }) {
  if (accounts.length === 0) {
    return <span className="text-sm text-muted-foreground">No accounts connected yet</span>;
  }
  const sorted = [...accounts].sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform));
  return (
    <div className="flex flex-wrap gap-1">
      {sorted.map((account) => {
        const state = accountState(account);
        const style = STATE_STYLE[state];
        return (
          <Tooltip key={account.platform}>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <Chip state={state}>{SHORT_LABEL[account.platform]}</Chip>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 text-pretty">
              <span className="font-medium">{PLATFORM_LABELS[account.platform]}:</span> {style.label}
              {state === "broken" && account.lastError ? ` — ${friendlyError(account.lastError).summary}` : ""}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        {active && <Icon className="size-3" aria-hidden />}
      </button>
    </TableHead>
  );
}

function ClientRow({ client, now, onOpen }: { client: ClientListItem; now: Date; onOpen: () => void }) {
  const router = useRouter();
  const [checking, startChecking] = useTransition();
  const [toggling, startToggling] = useTransition();
  const health = healthOf(client);

  function check() {
    startChecking(async () => {
      const results = await verifyAllMappings(client.id);
      router.refresh();
      const failed = results.filter((r) => r.result.status === "error").length;
      if (results.length === 0) {
        toast({ variant: "default", title: `${client.name} has no accounts to check` });
      } else if (failed === 0) {
        toast({ variant: "success", title: `${client.name}: all ${results.length} accounts working` });
      } else {
        toast({
          variant: "error",
          title: `${client.name}: ${failed} of ${results.length} not working`,
          description: "Open the client to see why.",
        });
      }
    });
  }

  function restore() {
    startToggling(async () => {
      await unarchiveClient(client.id);
      router.refresh();
      toast({ variant: "success", title: `${client.name} restored`, description: "Numbers will be collected again from the next update." });
    });
  }

  function togglePaused() {
    if (
      client.active &&
      !window.confirm(`Pause ${client.name}? We'll stop collecting new numbers for them, but keep everything collected so far.`)
    ) {
      return;
    }
    startToggling(async () => {
      if (client.active) await deactivateClient(client.id);
      else await reactivateClient(client.id);
      router.refresh();
      toast({ variant: "success", title: client.active ? `${client.name} paused` : `${client.name} resumed` });
    });
  }

  return (
    <TableRow className={cn("cursor-pointer", !client.active && "opacity-60")} onClick={onOpen}>
      <TableCell className="py-3">
        <Link
          href={`/settings/clients/${client.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-foreground hover:underline"
        >
          {client.name}
        </Link>
        <div className="text-xs text-muted-foreground">{client.timezone}</div>
      </TableCell>
      <TableCell className="py-3">
        <AccountBadges accounts={client.accounts} />
      </TableCell>
      <TableCell className={cn("py-3 text-sm", HEALTH_TONE[health.tone])}>{health.label}</TableCell>
      <TableCell className="py-3 text-sm text-muted-foreground">
        {client.lastUpdatedAt ? formatRelativeTime(client.lastUpdatedAt, now) : "Never"}
      </TableCell>
      <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {client.active && client.accounts.length > 0 && (
            <Button type="button" size="sm" variant="outline" disabled={checking} onClick={check}>
              <CheckCheckIcon className="size-3.5" aria-hidden />
              {checking ? "Checking…" : "Check"}
            </Button>
          )}
          {client.archived ? (
            <Button type="button" size="sm" variant="outline" disabled={toggling} onClick={restore}>
              Restore
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" disabled={toggling} onClick={togglePaused}>
              {client.active ? "Pause" : "Resume"}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
