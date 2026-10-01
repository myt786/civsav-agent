"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmSubmitButton } from "@/components/settings/confirm-submit-button";
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
  accounts: ClientAccount[];
}

type AccountState = "working" | "quiet" | "broken" | "unchecked" | "paused";

function accountState(account: ClientAccount): AccountState {
  if (!account.active) return "paused";
  if (!account.verifiedAt) return "unchecked";
  if (account.verifiedStatus === "error") return "broken";
  if (account.verifiedStatus === "no_data") return "quiet";
  return "working";
}

const STATE_STYLE: Record<AccountState, { badge: string; dot: string; label: string }> = {
  working: { badge: "border-success/30 text-success", dot: "bg-success", label: "Working" },
  quiet: { badge: "border-warning/30 text-warning", dot: "bg-warning", label: "Connected, no recent activity" },
  broken: { badge: "border-destructive/40 bg-destructive/5 text-destructive", dot: "bg-destructive", label: "Not working" },
  unchecked: { badge: "border-border text-muted-foreground", dot: "border border-muted-foreground/70", label: "Not checked yet" },
  paused: { badge: "border-dashed border-border text-muted-foreground/70", dot: "bg-muted-foreground/40", label: "Updates paused" },
};

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

type StatusFilter = "all" | "attention" | "unchecked" | "paused";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "unchecked", label: "Not checked" },
  { value: "paused", label: "Paused" },
];

function needsAttention(client: ClientListItem) {
  return client.active && client.accounts.some((a) => accountState(a) === "broken");
}
function hasUnchecked(client: ClientListItem) {
  return client.active && client.accounts.some((a) => accountState(a) === "unchecked");
}

function matchesStatus(client: ClientListItem, filter: StatusFilter) {
  if (filter === "attention") return needsAttention(client);
  if (filter === "unchecked") return hasUnchecked(client);
  if (filter === "paused") return !client.active;
  return true;
}

// "any" | "has:<platform>" | "missing:<platform>"
function matchesPlatform(client: ClientListItem, filter: string) {
  if (filter === "any") return true;
  const [mode, platform] = filter.split(":");
  const has = client.accounts.some((a) => a.platform === platform);
  return mode === "has" ? has : !has;
}

export function ClientsList({
  clients,
  deactivateClient,
}: {
  clients: ClientListItem[];
  deactivateClient: (clientId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [platform, setPlatform] = useState("any");

  const counts = useMemo(
    () => ({
      all: clients.length,
      attention: clients.filter(needsAttention).length,
      unchecked: clients.filter(hasUnchecked).length,
      paused: clients.filter((c) => !c.active).length,
    }),
    [clients],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter(
      (c) => (!q || c.name.toLowerCase().includes(q)) && matchesStatus(c, status) && matchesPlatform(c, platform),
    );
  }, [clients, query, status, platform]);

  const filtersActive = query.trim() !== "" || status !== "all" || platform !== "any";

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
        {clients.length > 0 && (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by status">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={status === f.value}
                  onClick={() => setStatus(f.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                    status === f.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    f.value === "attention" && status !== f.value && counts.attention > 0 && "text-destructive",
                  )}
                >
                  {f.label}
                  <span className={cn("tabular-nums", status === f.value ? "opacity-80" : "opacity-60")}>
                    {counts[f.value]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-full sm:w-56" aria-label="Filter by platform">
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
              <div className="relative w-full sm:w-64">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients…"
                  className="pl-8"
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
                <TableHead className="w-[30%]">Client</TableHead>
                <TableHead>Connected accounts</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-1" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/settings/clients/${client.id}`)}
                >
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
                  <TableCell className="py-3">
                    {client.active ? (
                      <Badge variant="outline" className="border-success/30 text-success">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                        Paused
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
                    {client.active && (
                      <form action={deactivateClient.bind(null, client.id)}>
                        <ConfirmSubmitButton
                          type="submit"
                          size="sm"
                          variant="ghost"
                          confirmMessage={`Pause ${client.name}? We'll stop collecting new numbers for them, but keep everything collected so far.`}
                        >
                          Pause
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No clients yet — click &ldquo;Add client&rdquo; to add your first one.
                  </TableCell>
                </TableRow>
              )}
              {clients.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
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
            {filtersActive ? `Showing ${filtered.length} of ${clients.length} clients` : `${clients.length} clients`} ·
            click a client to manage its accounts
          </span>
          <span className="flex flex-wrap items-center gap-3">
            {(["working", "quiet", "broken", "unchecked"] as const).map((state) => (
              <span key={state} className="flex items-center gap-1.5">
                <span className={cn("inline-block size-2 rounded-full", STATE_STYLE[state].dot)} aria-hidden />
                {STATE_STYLE[state].label}
              </span>
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
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((account) => {
        const state = accountState(account);
        const style = STATE_STYLE[state];
        return (
          <Tooltip key={account.platform}>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs whitespace-nowrap outline-none",
                  style.badge,
                )}
              >
                <span className={cn("inline-block size-1.5 rounded-full", style.dot)} aria-hidden />
                {SHORT_LABEL[account.platform]}
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
