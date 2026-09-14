"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataCell } from "@/components/dashboard/data-cell";
import { formatInteger, formatPercent, formatPosition } from "@/lib/dashboard/format";
import { TierBadge, TrendIndicator } from "./tier-trend";
import { SeoEditorialForm } from "./seo-editorial-form";
import type { CellState } from "@/lib/dashboard/types";
import type { SeoClientRow } from "@/lib/seo/types";

export function SeoDetailSheet({
  open,
  onOpenChange,
  row,
  currentMonth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: SeoClientRow | null;
  currentMonth: string;
}) {
  if (!row) {
    return <Sheet open={open} onOpenChange={onOpenChange} />;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>{row.clientName}</SheetTitle>
          <SheetDescription>Search Console + Ahrefs, 3-month rolling view</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-6">
          <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <TierBadge tier={row.tier} />
            <TrendIndicator trend={row.trend} />
            <Stat label="MoM%" value={row.momPct === null ? "—" : formatPercent(row.momPct * 100)} />
            <Stat label="3-mo avg" value={row.avg3 === null ? "—" : formatInteger(row.avg3)} />
            <Stat
              label="New refdomains"
              value={row.newReferringDomains === null ? "—" : `${row.newReferringDomains > 0 ? "+" : ""}${row.newReferringDomains}`}
            />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">By month (clicks)</h3>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {row.months.map((m) => (
                <div key={m.month} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-foreground">{m.month}</span>
                  <div className="flex items-center gap-4">
                    <DataCell state={m.impressions} format={formatInteger} />
                    <DataCell state={m.avgPosition} format={formatPosition} />
                    <DataCell state={m.clicks} format={formatInteger} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-right text-[11px] text-muted-foreground">impressions · avg. position · clicks</p>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Ahrefs</h3>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              <Row label="Organic keywords" state={row.organicKeywords} />
              <Row label="Top-3 keywords" state={row.organicKeywordsTop3} />
              <Row label="Keywords gained" state={row.keywordsGained} />
              <Row label="Keywords lost" state={row.keywordsLost} />
              <Row label="Referring domains" state={row.referringDomains} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              SEO Owner / Status / Notes — {currentMonth}
            </h3>
            <SeoEditorialForm
              clientId={row.clientId}
              month={currentMonth}
              seoOwner={row.seoOwner}
              status={row.status}
              notes={row.notes}
              prevMonthSummary={row.prevMonthSummary}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, state }: { label: string; state: CellState<number> }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="text-foreground">{label}</span>
      <DataCell state={state} format={formatInteger} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}
