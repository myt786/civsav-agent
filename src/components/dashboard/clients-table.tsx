"use client";

import { useState } from "react";
import { flexRender, useTable, type SortingState } from "@tanstack/react-table";
import { ChevronRightIcon, ChevronsUpDownIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createClientColumns } from "./columns";
import { dashboardTableFeatures } from "./table-config";
import { RowDetailSheet } from "./row-detail-sheet";
import { cn } from "@/lib/utils";
import { STALE_HOURS } from "@/lib/dashboard/constants";
import type { ClientDetail, ClientRow } from "@/lib/dashboard/types";

export function ClientsTable({
  rows,
  details,
  now,
}: {
  rows: ClientRow[];
  details: Record<string, ClientDetail>;
  now: Date;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const columns = createClientColumns(now);
  const table = useTable({
    features: dashboardTableFeatures,
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const selectedRow = rows.find((r) => r.clientId === selectedClientId) ?? null;
  const selectedDetail = selectedClientId ? details[selectedClientId] : undefined;

  return (
    <TooltipProvider>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sortState = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase select-none",
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
                <TableHead className="h-9 w-8 bg-muted/40" />
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
                  className={cn("h-12 cursor-pointer", stale && "bg-destructive/[0.035]")}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className="py-0">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                  <TableCell className="py-0 text-muted-foreground/50">
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
