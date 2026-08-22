"use client";

import { createColumnHelper, type SortFn } from "@tanstack/react-table";
import { ClockAlertIcon } from "lucide-react";
import type { CallsValue, CellState, ClientRow } from "@/lib/dashboard/types";
import { DataCell, DeltaCellView } from "./data-cell";
import { formatCurrency, formatInteger, formatPosition, formatRelativeTime } from "@/lib/dashboard/format";
import { STALE_HOURS } from "@/lib/dashboard/constants";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { dashboardTableFeatures } from "./table-config";

type Features = typeof dashboardTableFeatures;

const columnHelper = createColumnHelper<Features, ClientRow>();

function numericValue(state: CellState<number>): number {
  return state.kind === "ok" || state.kind === "unverified" ? state.value : Number.NEGATIVE_INFINITY;
}

function sortByCell<K extends keyof ClientRow>(key: K): SortFn<Features, ClientRow> {
  return (rowA, rowB) => {
    const a = rowA.original[key] as CellState<number>;
    const b = rowB.original[key] as CellState<number>;
    return numericValue(a) - numericValue(b);
  };
}

export function createClientColumns(now: Date) {
  return columnHelper.columns([
  columnHelper.accessor("clientName", {
    id: "client",
    header: "Client",
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
    sortFn: (rowA, rowB) => rowA.original.clientName.localeCompare(rowB.original.clientName),
  }),
  columnHelper.accessor("leads", {
    id: "leads",
    header: () => <span className="block text-right">Leads 7d</span>,
    cell: (info) => <DataCell state={info.getValue()} format={formatInteger} />,
    sortFn: sortByCell("leads"),
  }),
  columnHelper.accessor("leadsDelta", {
    id: "leadsDelta",
    header: () => <span className="block text-right">vs prev 7d</span>,
    cell: (info) => <DeltaCellView delta={info.getValue()} />,
    sortFn: (rowA, rowB) => {
      const a = rowA.original.leadsDelta.pct ?? Number.NEGATIVE_INFINITY;
      const b = rowB.original.leadsDelta.pct ?? Number.NEGATIVE_INFINITY;
      return a - b;
    },
  }),
  columnHelper.accessor("calls", {
    id: "calls",
    header: () => <span className="block text-right">Calls / Missed</span>,
    cell: (info) => (
      <DataCell<CallsValue>
        state={info.getValue()}
        format={(v) => `${formatInteger(v.total)} / ${formatInteger(v.missed)}`}
      />
    ),
    sortFn: (rowA, rowB) => {
      const a = rowA.original.calls;
      const b = rowB.original.calls;
      const av = a.kind === "ok" || a.kind === "unverified" ? a.value.total : Number.NEGATIVE_INFINITY;
      const bv = b.kind === "ok" || b.kind === "unverified" ? b.value.total : Number.NEGATIVE_INFINITY;
      return av - bv;
    },
  }),
  columnHelper.accessor("spend", {
    id: "spend",
    header: () => <span className="block text-right">Spend (Google + Meta)</span>,
    cell: (info) => <DataCell state={info.getValue()} format={formatCurrency} />,
    sortFn: sortByCell("spend"),
  }),
  columnHelper.accessor("cpl", {
    id: "cpl",
    header: () => <span className="block text-right">CPL</span>,
    cell: (info) => <DataCell state={info.getValue()} format={formatCurrency} />,
    sortFn: sortByCell("cpl"),
  }),
  columnHelper.accessor("sessions", {
    id: "sessions",
    header: () => <span className="block text-right">Sessions</span>,
    cell: (info) => <DataCell state={info.getValue()} format={formatInteger} />,
    sortFn: sortByCell("sessions"),
  }),
  columnHelper.accessor("conversions", {
    id: "conversions",
    header: () => <span className="block text-right">Conversions</span>,
    cell: (info) => <DataCell state={info.getValue()} format={formatInteger} />,
    sortFn: sortByCell("conversions"),
  }),
  columnHelper.accessor("avgPosition", {
    id: "avgPosition",
    header: () => <span className="block text-right">Avg position</span>,
    cell: (info) => <DataCell state={info.getValue()} format={formatPosition} />,
    sortFn: sortByCell("avgPosition"),
  }),
  columnHelper.accessor("lastSyncedAt", {
    id: "lastSynced",
    header: () => <span className="block text-right">Last synced</span>,
    cell: (info) => {
      const at = info.getValue();
      const stale = (info.row.original.staleHours ?? 0) > STALE_HOURS;
      if (!at) {
        return <span className="flex items-center justify-end font-mono tabular-nums text-muted-foreground/50">—</span>;
      }
      return (
        <span
          className={cn(
            "flex items-center justify-end gap-1.5 font-mono tabular-nums",
            stale ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {stale && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ClockAlertIcon tabIndex={0} className="size-3.5" aria-hidden />
              </TooltipTrigger>
              <TooltipContent>
                Last synced {info.row.original.staleHours}h ago — over the {STALE_HOURS}h freshness window.
              </TooltipContent>
            </Tooltip>
          )}
          {formatRelativeTime(at, now)}
        </span>
      );
    },
    sortFn: (rowA, rowB) => {
      const a = rowA.original.lastSyncedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const b = rowB.original.lastSyncedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      return a - b;
    },
  }),
  ]);
}
