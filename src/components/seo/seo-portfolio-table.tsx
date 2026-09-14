"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataCell } from "@/components/dashboard/data-cell";
import { formatInteger, formatPercent } from "@/lib/dashboard/format";
import { TierBadge, TrendIndicator } from "./tier-trend";
import { SeoDetailSheet } from "./seo-detail-sheet";
import type { SeoClientRow } from "@/lib/seo/types";

function formatSignedPercent(pct: number): string {
  return formatPercent(pct * 100);
}

export function SeoPortfolioTable({ rows, months }: { rows: SeoClientRow[]; months: string[] }) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const selectedRow = rows.find((r) => r.clientId === selectedClientId) ?? null;
  const currentMonth = months[months.length - 1];

  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Client
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Tier
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Trend
              </TableHead>
              {months.map((m) => (
                <TableHead
                  key={m}
                  className="h-9 bg-muted/40 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  {m}
                </TableHead>
              ))}
              <TableHead className="h-9 bg-muted/40 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                3-mo Avg
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                MoM%
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Org KW
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                KW +/-
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                New RefDom
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                SEO Owner
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow
                key={row.clientId}
                role="button"
                tabIndex={0}
                aria-expanded={selectedClientId === row.clientId}
                onClick={() => setSelectedClientId(row.clientId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedClientId(row.clientId);
                }}
                className="h-12 cursor-pointer animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms`, animationDuration: "300ms" }}
              >
                <TableCell className="py-0 font-medium text-foreground">{row.clientName}</TableCell>
                <TableCell className="py-0">
                  <TierBadge tier={row.tier} />
                </TableCell>
                <TableCell className="py-0">
                  <TrendIndicator trend={row.trend} />
                </TableCell>
                {row.months.map((m) => (
                  <TableCell key={m.month} className="py-0">
                    <DataCell state={m.clicks} format={formatInteger} />
                  </TableCell>
                ))}
                <TableCell className="py-0">
                  {row.avg3 === null ? (
                    <span className="flex justify-end text-muted-foreground/50">—</span>
                  ) : (
                    <span className="flex justify-end font-mono tabular-nums text-foreground">
                      {formatInteger(row.avg3)}
                    </span>
                  )}
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
                <TableCell className="py-0">
                  <DataCell state={row.organicKeywords} format={formatInteger} />
                </TableCell>
                <TableCell className="py-0">
                  {row.keywordsGained.kind === "no_data" ? (
                    <span className="flex justify-end text-muted-foreground/50">—</span>
                  ) : row.keywordsGained.kind === "ok" || row.keywordsGained.kind === "unverified" ? (
                    <span className="flex justify-end gap-1 font-mono tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-500">+{row.keywordsGained.value}</span>
                      <span className="text-destructive">
                        -{row.keywordsLost.kind === "ok" || row.keywordsLost.kind === "unverified" ? row.keywordsLost.value : 0}
                      </span>
                    </span>
                  ) : (
                    <span className="flex justify-end text-destructive">!</span>
                  )}
                </TableCell>
                <TableCell className="py-0">
                  {row.newReferringDomains === null ? (
                    <span className="flex justify-end text-muted-foreground/50">—</span>
                  ) : (
                    <span
                      className={
                        row.newReferringDomains > 0
                          ? "flex justify-end font-mono tabular-nums text-emerald-600 dark:text-emerald-500"
                          : row.newReferringDomains < 0
                            ? "flex justify-end font-mono tabular-nums text-destructive"
                            : "flex justify-end font-mono tabular-nums text-muted-foreground"
                      }
                    >
                      {row.newReferringDomains > 0 ? "+" : ""}
                      {row.newReferringDomains}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-0 text-muted-foreground">{row.seoOwner ?? "—"}</TableCell>
                <TableCell className="py-0 text-muted-foreground">{row.status ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
