"use client";

import { useMemo, useState } from "react";
import { flexRender, useTable, type SortingState } from "@tanstack/react-table";
import { ChevronsUpDownIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createClientColumns } from "./columns";
import { dashboardTableFeatures } from "./table-config";
import { RowDetailSheet } from "./row-detail-sheet";
import { UnverifiedMark } from "./data-cell";
import { cn } from "@/lib/utils";
import { STALE_HOURS } from "@/lib/dashboard/constants";
import type { ClientDetail, ClientRow } from "@/lib/dashboard/types";
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

  // Clients with nothing to show yet are collapsed below the ones that do,
  // so the table opens on real numbers instead of screens of em dashes.
  const { withData, empty } = useMemo(() => {
    const withData: ClientRow[] = [];
    const empty: ClientRow[] = [];
    for (const row of rows) (hasNoData(row) ? empty : withData).push(row);
    return { withData, empty };
  }, [rows]);
  const visibleRows = showEmpty ? [...withData, ...empty] : withData;

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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {withData.length} of {rows.length} client{rows.length === 1 ? "" : "s"} with data · click a row for the
            full breakdown
          </span>
          <span className="flex items-center gap-1.5">
            <UnverifiedMark /> unverified — account mapping not yet confirmed in Settings
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
                      <TableCell key={cell.id} className="py-0 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {empty.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span>
                {empty.length} client{empty.length === 1 ? " has" : "s have"} no data from any platform yet
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
