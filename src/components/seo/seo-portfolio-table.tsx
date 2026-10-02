"use client";

import { useMemo, useState } from "react";
import { ChevronRightIcon, ChevronsUpDownIcon, ChevronUpIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { DataCell, UnverifiedMark } from "@/components/dashboard/data-cell";
import { Button } from "@/components/ui/button";
import { formatInteger, formatPercent, formatPosition } from "@/lib/dashboard/format";
import { SegmentedFilter } from "@/components/ui/segmented-filter";
import type { Trend } from "@/lib/seo/compute";
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

type SortKey = "client" | "tier" | "trend" | "clicks" | "mom" | "impressions" | "position" | "keywords";

const SORT_LABEL: Record<SortKey, string> = {
  client: "Client",
  tier: "Tier",
  trend: "3-month trend",
  clicks: "Clicks",
  mom: "Change vs last month",
  impressions: "Impressions",
  position: "Google position",
  keywords: "Keywords",
};

function cellNumber(cell: { kind: string; value?: number } | undefined): number | null {
  return cell && (cell.kind === "ok" || cell.kind === "unverified") && typeof cell.value === "number" ? cell.value : null;
}

const GROWING: Trend[] = ["growing", "growing_fast"];
const FALLING: Trend[] = ["declining", "falling_fast"];

type Filter = "all" | "growing" | "falling" | "small" | "no_data";

function matchesFilter(row: SeoClientRow, filter: Filter): boolean {
  if (filter === "growing") return GROWING.includes(row.trend);
  if (filter === "falling") return FALLING.includes(row.trend);
  if (filter === "small") return row.tier === "small" || row.tier === "minimal";
  if (filter === "no_data") return row.tier === "no_data";
  return true;
}

// Three tiny bars, one per month — the shape behind "Growing fast" or
// "Falling fast" at a glance, scaled to the client's own best month.
function MonthBars({ row }: { row: SeoClientRow }) {
  const values = row.months.map((m) => cellNumber(m.clicks));
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex h-6 items-end gap-0.5" tabIndex={0} aria-label="Clicks per month">
          {values.map((v, i) => (
            <span
              key={row.months[i].month}
              className={cn(
                "w-2 rounded-sm",
                v === null ? "h-px bg-border" : i === values.length - 1 ? "bg-primary" : "bg-primary/35",
              )}
              style={v === null ? undefined : { height: `${Math.max(8, (v / max) * 100)}%` }}
            />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {row.months.map((m, i) => (
          <div key={m.month} className="flex justify-between gap-4 tabular-nums">
            <span>{m.month}</span>
            <span>{values[i] === null ? "—" : formatInteger(values[i]!)}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

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
    case "impressions": {
      const pick = (r: SeoClientRow) => cellNumber(r.months[r.months.length - 1]?.impressions) ?? -1;
      return pick(b) - pick(a);
    }
    case "position": {
      // Best (lowest) position first; no data last.
      const pick = (r: SeoClientRow) => cellNumber(r.months[r.months.length - 1]?.avgPosition) ?? Infinity;
      return pick(a) - pick(b);
    }
    case "keywords":
      return (cellNumber(b.organicKeywords) ?? -1) - (cellNumber(a.organicKeywords) ?? -1);
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
  const [filter, setFilter] = useState<Filter>("all");

  const selectedRow = rows.find((r) => r.clientId === selectedClientId) ?? null;
  const currentMonth = months[months.length - 1];

  // Columns that are empty for every client (not synced / never filled in)
  // are dropped rather than rendered as a column of em dashes; they come
  // back automatically once any client has a value.
  const showTrend = rows.some((r) => r.trend !== "unknown");
  const showOwner = rows.some((r) => r.seoOwner);
  const showStatus = rows.some((r) => r.status);
  const showKeywords = rows.some((r) => cellNumber(r.organicKeywords) !== null);
  const columnCount = 7 + Number(showTrend) + Number(showOwner) + Number(showStatus) + Number(showKeywords);
  // The newest month is the last full month, not the current one — say which.
  const monthLabel = new Date(`${currentMonth}-01T00:00:00`).toLocaleString("en-US", { month: "short" });

  const filterCounts = {
    all: rows.length,
    growing: rows.filter((r) => matchesFilter(r, "growing")).length,
    falling: rows.filter((r) => matchesFilter(r, "falling")).length,
    small: rows.filter((r) => matchesFilter(r, "small")).length,
    no_data: rows.filter((r) => matchesFilter(r, "no_data")).length,
  };

  const query = search.trim().toLowerCase();
  const noDataCount = rows.filter((r) => r.tier === "no_data").length;
  // "No Data" clients collapse behind a toggle (same as the dashboard) —
  // except while searching, where every match should show.
  const collapseNoData = !query && !showNoData && filter === "all";

  const visibleRows = useMemo(() => {
    let filtered = rows.filter((r) => (!query || r.clientName.toLowerCase().includes(query)) && matchesFilter(r, filter));
    if (collapseNoData) filtered = filtered.filter((r) => r.tier !== "no_data");
    const sorted = [...filtered].sort((a, b) => compareRows(a, b, sortKey));
    return sortDir === "asc" ? sorted.reverse() : sorted;
  }, [rows, query, filter, collapseNoData, sortKey, sortDir]);

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
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedFilter
            ariaLabel="Filter clients"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: filterCounts.all },
              { value: "growing", label: "Growing", count: filterCounts.growing },
              { value: "falling", label: "Falling", count: filterCounts.falling, alert: true },
              { value: "small", label: "Small or minimal", count: filterCounts.small },
              { value: "no_data", label: "No data", count: filterCounts.no_data },
            ]}
          />
          <div className="relative w-full lg:w-72">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="h-9 bg-card pl-8"
              aria-label="Search clients"
            />
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UnverifiedMark /> not checked yet — the account hasn&apos;t been confirmed in Settings
        </span>

        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHead label="Client" sortKey="client" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <SortableHead label="Tier" sortKey="tier" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  3 months
                </TableHead>
                {showTrend && (
                  <SortableHead label="Trend" sortKey="trend" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                )}
                <SortableHead
                  label={`Clicks · ${monthLabel}`}
                  sortKey="clicks"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHead label="vs last month" sortKey="mom" activeKey={sortKey} direction={sortDir} onSort={handleSort} align="right" />
                <SortableHead
                  label="Impressions"
                  sortKey="impressions"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortableHead
                  label="Google position"
                  sortKey="position"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                {showKeywords && (
                  <SortableHead
                    label="Keywords"
                    sortKey="keywords"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                )}
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
                    {query ? <>No clients match &ldquo;{search}&rdquo;.</> : filter !== "all" ? "No clients in this group." : "No clients have SEO data yet."}
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
                  <TableCell className="py-0">
                    <MonthBars row={row} />
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
                      <span
                        className={cn(
                          "flex justify-end font-mono tabular-nums",
                          Math.abs(row.momPct) < 0.05
                            ? "text-muted-foreground"
                            : row.momPct > 0
                              ? "text-success"
                              : "text-destructive",
                        )}
                      >
                        {formatSignedPercent(row.momPct)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-0">
                    <DataCell state={row.months[row.months.length - 1].impressions} format={formatInteger} />
                  </TableCell>
                  <TableCell className="py-0">
                    <DataCell state={row.months[row.months.length - 1].avgPosition} format={formatPosition} />
                  </TableCell>
                  {showKeywords && (
                    <TableCell className="py-0">
                      <DataCell state={row.organicKeywords} format={formatInteger} />
                    </TableCell>
                  )}
                  {showOwner && <TableCell className="py-0 text-muted-foreground">{row.seoOwner ?? "—"}</TableCell>}
                  {showStatus && <TableCell className="py-0 text-muted-foreground">{row.status ?? "—"}</TableCell>}
                  <TableCell className="py-0 text-muted-foreground/50">
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!query && filter === "all" && noDataCount > 0 && (
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
