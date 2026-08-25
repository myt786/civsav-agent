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

// Dotted underline hints "hover me" the same way a native <abbr> does —
// every column except Client carries one, explaining exactly what window
// and formula produced the number (same wording as the /docs reference).
function ColumnHeader({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="block cursor-help border-b border-dotted border-muted-foreground/50 text-right outline-none"
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">{tooltip}</TooltipContent>
    </Tooltip>
  );
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
    header: () => (
      <ColumnHeader label="Leads 7d" tooltip="Sum of daily lead counts from Lead Dashboard over the trailing 7 full days (not including today, which is still incomplete)." />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatInteger} />,
    sortFn: sortByCell("leads"),
  }),
  columnHelper.accessor("leadsDelta", {
    id: "leadsDelta",
    header: () => (
      <ColumnHeader
        label="vs prev 7d"
        tooltip="Percent change in Leads 7d against the 7 days immediately before that window. Shown muted (—) when the change is within ±5% — day-to-day noise at that size usually isn't a real trend."
      />
    ),
    cell: (info) => <DeltaCellView delta={info.getValue()} />,
    sortFn: (rowA, rowB) => {
      const a = rowA.original.leadsDelta.pct ?? Number.NEGATIVE_INFINITY;
      const b = rowB.original.leadsDelta.pct ?? Number.NEGATIVE_INFINITY;
      return a - b;
    },
  }),
  columnHelper.accessor("calls", {
    id: "calls",
    header: () => (
      <ColumnHeader
        label="Calls / Missed"
        tooltip="Total calls from OpenPhone over 7 days, summed. Missed excludes any call that was flagged missed but actually forwarded and answered elsewhere — never double-counted."
      />
    ),
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
    header: () => (
      <ColumnHeader
        label="Spend (Google + Meta)"
        tooltip="Google Ads cost plus Meta Ads spend, combined and summed over the trailing 7 days."
      />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatCurrency} />,
    sortFn: sortByCell("spend"),
  }),
  columnHelper.accessor("cpl", {
    id: "cpl",
    header: () => (
      <ColumnHeader
        label="CPL"
        tooltip="Cost per lead: Spend ÷ Leads for the same 7-day window. Shows — (not $0) when there are no leads to divide by."
      />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatCurrency} />,
    sortFn: sortByCell("cpl"),
  }),
  columnHelper.accessor("sessions", {
    id: "sessions",
    header: () => <ColumnHeader label="Sessions" tooltip="Website sessions from GA4, summed over the trailing 7 days." />,
    cell: (info) => <DataCell state={info.getValue()} format={formatInteger} />,
    sortFn: sortByCell("sessions"),
  }),
  columnHelper.accessor("conversions", {
    id: "conversions",
    header: () => (
      <ColumnHeader label="Conversions" tooltip="On-site conversion events from GA4, summed over the trailing 7 days." />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatInteger} />,
    sortFn: sortByCell("conversions"),
  }),
  columnHelper.accessor("avgPosition", {
    id: "avgPosition",
    header: () => (
      <ColumnHeader
        label="Avg position"
        tooltip="Average organic search ranking position from Search Console, averaged (not summed) across the days with data. Lower is better."
      />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatPosition} />,
    sortFn: sortByCell("avgPosition"),
  }),
  columnHelper.accessor("lastSyncedAt", {
    id: "lastSynced",
    header: () => (
      <ColumnHeader label="Last synced" tooltip="The most recent successful data fetch for this client, across any connected platform." />
    ),
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
