"use client";

import { createColumnHelper, type SortFn } from "@tanstack/react-table";
import { AlertTriangleIcon, ClockAlertIcon } from "lucide-react";
import type { CallsValue, CellState, ClientDetail, ClientRow } from "@/lib/dashboard/types";
import type { AttentionFlag } from "@/lib/insights/types";
import { DataCell, DeltaCellView } from "./data-cell";
import { MiniSparkline } from "./mini-sparkline";
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

// A row's flags, from sharpest to mildest — drives both which icon color
// shows and which flag's message leads the tooltip when there's more than
// one. Computed by the same rule-based checks /insights shows in full, so
// this badge can never say something that page wouldn't back up.
function worstSeverity(flags: AttentionFlag[]): AttentionFlag["severity"] {
  return flags.some((f) => f.severity === "critical") ? "critical" : "warning";
}

export function createClientColumns(
  now: Date,
  flagsByClient: Map<string, AttentionFlag[]>,
  detailsByClient: Record<string, ClientDetail>,
) {
  return columnHelper.columns([
  columnHelper.accessor("clientName", {
    id: "client",
    header: "Client",
    cell: (info) => {
      const clientFlags = flagsByClient.get(info.row.original.clientId) ?? [];
      return (
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {clientFlags.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangleIcon
                  tabIndex={0}
                  className={cn(
                    "size-3.5 shrink-0",
                    worstSeverity(clientFlags) === "critical" ? "text-destructive" : "text-warning",
                  )}
                  aria-hidden
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-pretty">
                <ul className="flex flex-col gap-1">
                  {clientFlags.map((f, i) => (
                    <li key={i}>{f.message}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          )}
          {/* Capped so one long domain-style name can't push the numeric
              columns off the right edge; the full name is on hover. */}
          <span className="max-w-40 truncate" title={info.getValue()}>
            {info.getValue()}
          </span>
        </span>
      );
    },
    sortFn: (rowA, rowB) => rowA.original.clientName.localeCompare(rowB.original.clientName),
  }),
  columnHelper.accessor("leads", {
    id: "leads",
    header: () => (
      <ColumnHeader label="Leads 7d" tooltip="Leads in the last 7 full days (today isn't counted yet because it isn't over)." />
    ),
    cell: (info) => {
      const leadsSeries = detailsByClient[info.row.original.clientId]?.sparklines.find((s) => s.key === "leads");
      return (
        <span className="flex items-center justify-end gap-2">
          {leadsSeries && <MiniSparkline points={leadsSeries.points} stroke="var(--chart-1)" />}
          <DataCell state={info.getValue()} format={formatInteger} />
        </span>
      );
    },
    sortFn: sortByCell("leads"),
  }),
  columnHelper.accessor("leadsDelta", {
    id: "leadsDelta",
    header: () => (
      <ColumnHeader
        label="vs week before"
        tooltip="How leads this week compare with the week before. Changes smaller than 5% show as — because they're usually just normal ups and downs."
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
        tooltip="Calls in the last 7 days, and how many were missed. A call forwarded and answered somewhere else doesn't count as missed."
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
        label="Spend"
        tooltip="Ad spend in the last 7 days, Google Ads and Meta combined."
      />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatCurrency} />,
    sortFn: sortByCell("spend"),
  }),
  columnHelper.accessor("cpl", {
    id: "cpl",
    header: () => (
      <ColumnHeader
        label="Cost per lead"
        tooltip="Ad spend divided by leads, for the last 7 days. Shows — when there were no leads."
      />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatCurrency} />,
    sortFn: sortByCell("cpl"),
  }),
  columnHelper.accessor("sessions", {
    id: "sessions",
    header: () => <ColumnHeader label="Website visits" tooltip="Visits to the client's website in the last 7 days (from Google Analytics)." />,
    cell: (info) => <DataCell state={info.getValue()} format={formatInteger} />,
    sortFn: sortByCell("sessions"),
  }),
  columnHelper.accessor("conversions", {
    id: "conversions",
    header: () => (
      <ColumnHeader label="Enquiries" tooltip="Enquiries and other goals completed on the website in the last 7 days (from Google Analytics)." />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatInteger} />,
    sortFn: sortByCell("conversions"),
  }),
  columnHelper.accessor("avgPosition", {
    id: "avgPosition",
    header: () => (
      <ColumnHeader
        label="Google rank"
        tooltip="Average position in Google search results (from Search Console). Lower is better — 1 is the top result."
      />
    ),
    cell: (info) => <DataCell state={info.getValue()} format={formatPosition} />,
    sortFn: sortByCell("avgPosition"),
  }),
  columnHelper.accessor("lastSyncedAt", {
    id: "lastSynced",
    header: () => (
      <ColumnHeader label="Updated" tooltip="When this client's numbers were last updated." />
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
