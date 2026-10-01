"use client";

import { useMemo, useState } from "react";
import { flexRender, useTable, type SortingState } from "@tanstack/react-table";
import { ChevronsUpDownIcon, ChevronUpIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createClientColumns } from "./columns";
import { dashboardTableFeatures } from "./table-config";
import { RowDetailSheet } from "./row-detail-sheet";
import { UnverifiedMark } from "./data-cell";
import { cn } from "@/lib/utils";
import { STALE_HOURS } from "@/lib/dashboard/constants";
import type { CellState, ClientDetail, ClientRow } from "@/lib/dashboard/types";
import { formatCurrency, formatInteger } from "@/lib/dashboard/format";
import type { AttentionFlag } from "@/lib/insights/types";

// A row with no value in any metric column — typically a client whose
// connectors haven't reported yet. Errors count as "has something": a
// failing sync is exactly what someone scanning this table needs to see.
function hasNoData(row: ClientRow): boolean {
  return (
    row.leads.kind === "no_data" &&
    row.calls.kind === "no_data" &&
    row.spend.kind === "no_data" &&
    row.cpl.kind === "no_data" &&
    row.sessions.kind === "no_data" &&
    row.conversions.kind === "no_data" &&
    row.avgPosition.kind === "no_data"
  );
}

function has<T>(cell: CellState<T>): cell is Extract<CellState<T>, { value: T }> {
  return cell.kind === "ok" || cell.kind === "unverified";
}

type QuickFilter = "all" | "attention" | "ads" | "calls" | "website";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "ads", label: "Running ads" },
  { value: "calls", label: "Tracking calls" },
  { value: "website", label: "Website data" },
];

function matchesQuickFilter(row: ClientRow, filter: QuickFilter, flagged: Set<string>): boolean {
  if (filter === "attention") return flagged.has(row.clientId);
  if (filter === "ads") return has(row.spend) && row.spend.value > 0;
  if (filter === "calls") return has(row.calls);
  if (filter === "website") return has(row.sessions);
  return true;
}

// Totals for whatever rows are showing, computed from the same cells, so
// the footer always adds up to what's on screen.
function totalsFor(rows: ClientRow[]): Record<string, string> {
  const sumOf = (pick: (row: ClientRow) => CellState<number>) => {
    const values = rows.flatMap((row) => {
      const cell = pick(row);
      return has(cell) ? [cell.value] : [];
    });
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
  };
  const leads = sumOf((r) => r.leads);
  const spend = sumOf((r) => r.spend);
  const sessions = sumOf((r) => r.sessions);
  const conversions = sumOf((r) => r.conversions);
  const callValues = rows.flatMap((r) => (has(r.calls) ? [r.calls.value] : []));
  const calls = callValues.reduce((a, c) => a + c.total, 0);
  const missed = callValues.reduce((a, c) => a + c.missed, 0);
  // Blended cost per lead only over clients that have one, so a client
  // with leads but no ads doesn't drag it down.
  const cplRows = rows.filter((r) => has(r.cpl) && has(r.spend) && has(r.leads));
  const cplSpend = sumOf((r) => (cplRows.includes(r) ? r.spend : { kind: "no_data" }));
  const cplLeads = sumOf((r) => (cplRows.includes(r) ? r.leads : { kind: "no_data" }));

  const show = (value: number | null, format: (n: number) => string) => (value === null ? "—" : format(value));
  return {
    leads: show(leads, formatInteger),
    calls: callValues.length > 0 ? `${formatInteger(calls)} / ${formatInteger(missed)}` : "—",
    spend: show(spend, formatCurrency),
    cpl: cplSpend !== null && cplLeads ? formatCurrency(cplSpend / cplLeads) : "—",
    sessions: show(sessions, formatInteger),
    conversions: show(conversions, formatInteger),
  };
}

// Solid (not translucent) so body rows don't show through the sticky header.
const HEAD_BG = "bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]";

export function ClientsTable({
  rows,
  details,
  now,
  flags,
}: {
  rows: ClientRow[];
  details: Record<string, ClientDetail>;
  now: Date;
  flags: AttentionFlag[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const flaggedIds = useMemo(() => new Set(flags.map((f) => f.clientId)), [flags]);

  // Clients with nothing to show yet are collapsed below the ones that do,
  // so the table opens on real numbers instead of screens of em dashes.
  const { withData, empty } = useMemo(() => {
    const withData: ClientRow[] = [];
    const empty: ClientRow[] = [];
    for (const row of rows) (hasNoData(row) ? empty : withData).push(row);
    return { withData, empty };
  }, [rows]);
  const q = query.trim().toLowerCase();
  const filtering = q !== "" || quickFilter !== "all";
  // While searching or filtering, look through every client — a search for
  // a client with no numbers yet should still find it.
  const visibleRows = (filtering || showEmpty ? [...withData, ...empty] : withData).filter(
    (row) => (!q || row.clientName.toLowerCase().includes(q)) && matchesQuickFilter(row, quickFilter, flaggedIds),
  );
  const filterCounts = Object.fromEntries(
    QUICK_FILTERS.map((f) => [f.value, rows.filter((row) => matchesQuickFilter(row, f.value, flaggedIds)).length]),
  ) as Record<QuickFilter, number>;
  const totals = totalsFor(visibleRows);

  const flagsByClient = new Map<string, AttentionFlag[]>();
  for (const flag of flags) {
    const list = flagsByClient.get(flag.clientId) ?? [];
    list.push(flag);
    flagsByClient.set(flag.clientId, list);
  }

  const columns = createClientColumns(now, flagsByClient, details);
  const table = useTable({
    features: dashboardTableFeatures,
    data: visibleRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const selectedRow = rows.find((r) => r.clientId === selectedClientId) ?? null;
  const selectedDetail = selectedClientId ? details[selectedClientId] : undefined;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex h-9 max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-lg bg-muted p-0.5"
            role="radiogroup"
            aria-label="Filter clients"
          >
            {QUICK_FILTERS.map((f) => {
              const selected = quickFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setQuickFilter(f.value)}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors",
                    selected ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
                      f.value === "attention" && filterCounts.attention > 0
                        ? "bg-warning/15 font-medium text-warning"
                        : "text-muted-foreground/80",
                    )}
                  >
                    {filterCounts[f.value]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="relative w-full lg:w-64">
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {filtering
              ? `Showing ${visibleRows.length} of ${rows.length} clients`
              : `${withData.length} of ${rows.length} client${rows.length === 1 ? "" : "s"} with data`}{" "}
            · click a row for the full breakdown
          </span>
          <span className="flex items-center gap-1.5">
            <UnverifiedMark /> not checked yet — probably right, but the account hasn&apos;t been confirmed in Settings
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border shadow-sm">
          {/* Own vertical scroll so the header can stick while scanning a
              long list — sticky can't anchor to the page through the
              container's overflow-x. */}
          <Table containerClassName="max-h-[calc(100dvh-7rem)] overflow-y-auto">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const sortState = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "sticky top-0 z-10 h-9 text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase select-none",
                          HEAD_BG,
                          header.column.getCanSort() && "cursor-pointer hover:text-foreground",
                          // Client name stays pinned while the numbers scroll
                          // sideways on narrower screens.
                          header.column.id === "client" && "left-0 z-20 shadow-[1px_0_0_var(--border)]",
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="flex items-center justify-end gap-1 [&:first-child]:justify-start">
                          {header.column.id === "client" ? null : sortState === "asc" ? (
                            <ChevronUpIcon className="size-3" aria-hidden />
                          ) : sortState === "desc" ? (
                            <ChevronDownIcon className="size-3" aria-hidden />
                          ) : header.column.getCanSort() ? (
                            <ChevronsUpDownIcon className="size-3 opacity-30" aria-hidden />
                          ) : null}
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => {
                const stale = (row.original.staleHours ?? 0) > STALE_HOURS;
                return (
                  <TableRow
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    aria-expanded={selectedClientId === row.original.clientId}
                    onClick={() => setSelectedClientId(row.original.clientId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelectedClientId(row.original.clientId);
                    }}
                    className={cn("h-11 cursor-pointer", stale && "bg-destructive/[0.035]")}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "py-0 whitespace-nowrap",
                          cell.column.id === "client" && "sticky left-0 z-[1] bg-card shadow-[1px_0_0_var(--border)]",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
            {visibleRows.length > 1 && (
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  {(table.getHeaderGroups().at(-1)?.headers ?? []).map(({ column }) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        "sticky bottom-0 z-10 h-10 py-0 text-right font-mono text-sm font-medium whitespace-nowrap tabular-nums text-foreground",
                        HEAD_BG,
                        column.id === "client" && "left-0 z-20 text-left font-sans shadow-[1px_0_0_var(--border)]",
                      )}
                    >
                      {column.id === "client" ? (
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Total · {visibleRows.length} clients
                        </span>
                      ) : (
                        (totals[column.id] ?? "")
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            )}
          </Table>
          {visibleRows.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No clients match.</div>
          )}
          {empty.length > 0 && !filtering && (
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span>
                {empty.length} client{empty.length === 1 ? " has" : "s have"} no numbers yet from any platform
                {showEmpty ? " — shown at the bottom." : "."}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowEmpty((v) => !v)}>
                {showEmpty ? "Hide them" : "Show them"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <RowDetailSheet
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedClientId(null);
        }}
        row={selectedRow}
        detail={selectedDetail}
      />
    </TooltipProvider>
  );
}
