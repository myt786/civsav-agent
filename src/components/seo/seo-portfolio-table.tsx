"use client";

import { useMemo, useState } from "react";
import { ChevronRightIcon, ChevronsUpDownIcon, ChevronUpIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { DataCell, UnverifiedMark } from "@/components/dashboard/data-cell";
import { Button } from "@/components/ui/button";
import { formatInteger, formatPercent } from "@/lib/dashboard/format";
import { TIER_RANK, TREND_RANK } from "@/lib/seo/compute";
import { TierBadge, TrendIndicator } from "./tier-trend";
import { SeoDetailSheet } from "./seo-detail-sheet";
import { cn } from "@/lib/utils";
import type { SeoClientRow } from "@/lib/seo/types";

function formatSignedPercent(pct: number): string {
  return formatPercent(pct * 100);
}

function clicksValue(row: SeoClientRow): number {
  const cell = row.months[row.months.length - 1]?.clicks;
  return cell?.kind === "ok" || cell?.kind === "unverified" ? cell.value : -1;
}

type SortKey = "client" | "tier" | "trend" | "clicks" | "mom";

const SORT_LABEL: Record<SortKey, string> = {
  client: "Client",
  tier: "Tier",
  trend: "Trend",
  clicks: "Clicks (this month)",
  mom: "MoM%",
};

function compareRows(a: SeoClientRow, b: SeoClientRow, key: SortKey): number {
  switch (key) {
    case "client":
      return a.clientName.localeCompare(b.clientName);
    case "tier":
      return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    case "trend":
      return TREND_RANK[a.trend] - TREND_RANK[b.trend];
    case "clicks":
      return clicksValue(b) - clicksValue(a); // biggest first by default
    case "mom":
      return (b.momPct ?? -Infinity) - (a.momPct ?? -Infinity);
  }
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead
      onClick={() => onSort(sortKey)}
      className={cn(
        "h-9 cursor-pointer bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase select-none hover:text-foreground",
        align === "right" && "text-right",
      )}
    >
      <span className={cn("flex items-center gap-1", align === "right" && "justify-end")}>
        {align === "right" &&
          (active ? (
            direction === "asc" ? (
              <ChevronUpIcon className="size-3" aria-hidden />
            ) : (
              <ChevronDownIcon className="size-3" aria-hidden />
            )
          ) : (
            <ChevronsUpDownIcon className="size-3 opacity-30" aria-hidden />
          ))}
        {label}
        {align === "left" &&
          (active ? (
            direction === "asc" ? (
              <ChevronUpIcon className="size-3" aria-hidden />
            ) : (
              <ChevronDownIcon className="size-3" aria-hidden />
            )
          ) : (
            <ChevronsUpDownIcon className="size-3 opacity-30" aria-hidden />
          ))}
      </span>
    </TableHead>
  );
}

export function SeoPortfolioTable({ rows, months }: { rows: SeoClientRow[]; months: string[] }) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showNoData, setShowNoData] = useState(false);

  const selectedRow = rows.find((r) => r.clientId === selectedClientId) ?? null;
  const currentMonth = months[months.length - 1];

  // Columns that are empty for every client (not synced / never filled in)
  // are dropped rather than rendered as a column of em dashes; they come
  // back automatically once any client has a value.
  const showTrend = rows.some((r) => r.trend !== "unknown");
  const showOwner = rows.some((r) => r.seoOwner);
  const showStatus = rows.some((r) => r.status);
  const columnCount = 4 + Number(showTrend) + Number(showOwner) + Number(showStatus);

  const query = search.trim().toLowerCase();
  const noDataCount = rows.filter((r) => r.tier === "no_data").length;
  // "No Data" clients collapse behind a toggle (same as the dashboard) —
  // except while searching, where every match should show.
  const collapseNoData = !query && !showNoData;

  const visibleRows = useMemo(() => {
    let filtered = query ? rows.filter((r) => r.clientName.toLowerCase().includes(query)) : rows;
    if (collapseNoData) filtered = filtered.filter((r) => r.tier !== "no_data");
    const sorted = [...filtered].sort((a, b) => compareRows(a, b, sortKey));
    return sortDir === "asc" ? sorted.reverse() : sorted;
  }, [rows, query, collapseNoData, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full max-w-xs">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="pl-8"
              aria-label="Search clients"
            />
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UnverifiedMark /> unverified — account mapping not yet confirmed in Settings
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHead label="Client" sortKey="client" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableHead label="Tier" sortKey="tier" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                {showTrend && (
                  <SortableHead label="Trend" sortKey="trend" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                )}
                <SortableHead
                  label="Clicks (this month)"
                  sortKey="clicks"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHead label="MoM%" sortKey="mom" activeKey={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                {showOwner && (
                  <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    SEO Owner
                  </TableHead>
                )}
                {showStatus && (
                  <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Status
                  </TableHead>
                )}
                <TableHead className="h-9 w-8 bg-muted/40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columnCount} className="h-24 text-center text-sm text-muted-foreground">
                    {query ? <>No clients match &ldquo;{search}&rdquo;.</> : "No clients have SEO data yet."}
                  </TableCell>
                </TableRow>
              )}
              {visibleRows.map((row) => (
                <TableRow
                  key={row.clientId}
                  role="button"
                  tabIndex={0}
                  aria-expanded={selectedClientId === row.clientId}
                  onClick={() => setSelectedClientId(row.clientId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedClientId(row.clientId);
                  }}
                  className="h-11 cursor-pointer"
                >
                  <TableCell className="py-0 font-medium text-foreground">{row.clientName}</TableCell>
                  <TableCell className="py-0">
                    <TierBadge tier={row.tier} />
                  </TableCell>
                  {showTrend && (
                    <TableCell className="py-0">
                      <TrendIndicator trend={row.trend} />
                    </TableCell>
                  )}
                  <TableCell className="py-0">
                    <DataCell state={row.months[row.months.length - 1].clicks} format={formatInteger} />
                  </TableCell>
                  <TableCell className="py-0">
                    {row.momPct === null ? (
                      <span className="flex justify-end text-muted-foreground/50">—</span>
                    ) : (
                      <span className="flex justify-end font-mono tabular-nums text-foreground">
                        {formatSignedPercent(row.momPct)}
                      </span>
                    )}
                  </TableCell>
                  {showOwner && <TableCell className="py-0 text-muted-foreground">{row.seoOwner ?? "—"}</TableCell>}
                  {showStatus && <TableCell className="py-0 text-muted-foreground">{row.status ?? "—"}</TableCell>}
                  <TableCell className="py-0 text-muted-foreground/50">
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!query && noDataCount > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <span>
                {noDataCount} client{noDataCount === 1 ? " has" : "s have"} no SEO data yet
                {showNoData ? " — included above." : "."}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNoData((v) => !v)}>
                {showNoData ? "Hide them" : "Show them"}
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {visibleRows.length} of {rows.length} client{rows.length === 1 ? "" : "s"} shown, sorted by {SORT_LABEL[sortKey]}
          {sortDir === "asc" ? " (ascending)" : " (descending)"}. Click a row for the 3-month breakdown and to edit
          owner, status and notes.
        </p>
      </div>

      <SeoDetailSheet
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedClientId(null);
        }}
        row={selectedRow}
        currentMonth={currentMonth}
      />
    </TooltipProvider>
  );
}
