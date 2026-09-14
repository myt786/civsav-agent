"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataCell } from "@/components/dashboard/data-cell";
import { computeDelta } from "@/lib/dashboard/metrics";
import { formatInteger, formatPosition } from "@/lib/dashboard/format";
import { TierBadge, TrendIndicator } from "./tier-trend";
import { SeoMetricTile, DeltaLine, CountLine } from "./seo-metric-tile";
import { SeoAiSuggestions } from "./seo-ai-suggestions";
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

  const [, prev, newest] = row.months;
  const clicksDelta = computeDelta(newest.clicks, prev.clicks);
  const impressionsDelta = computeDelta(newest.impressions, prev.impressions);
  const positionDelta = computeDelta(newest.avgPosition, prev.avgPosition);

  const cellNumber = (cell: CellState<number>) => (cell.kind === "ok" || cell.kind === "unverified" ? cell.value : null);
  const keywordsGained = cellNumber(row.keywordsGained);
  const keywordsLost = cellNumber(row.keywordsLost);
  const top3Keywords = cellNumber(row.organicKeywordsTop3);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>{row.clientName}</SheetTitle>
          <SheetDescription>
            {newest.month} · Compared with {prev.month}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-6">
          <section className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <TierBadge tier={row.tier} />
            <TrendIndicator trend={row.trend} />
          </section>

          <section className="grid grid-cols-2 gap-3">
            <SeoMetricTile
              label="Organic clicks"
              value={newest.clicks.kind === "ok" || newest.clicks.kind === "unverified" ? formatInteger(newest.clicks.value) : "—"}
              subtitle="Organic search clicks"
              footer={<DeltaLine delta={clicksDelta} />}
            />
            <SeoMetricTile
              label="Impressions"
              value={
                newest.impressions.kind === "ok" || newest.impressions.kind === "unverified"
                  ? formatInteger(newest.impressions.value)
                  : "—"
              }
              subtitle="Search impressions"
              footer={<DeltaLine delta={impressionsDelta} />}
            />
            <SeoMetricTile
              label="Avg. position"
              value={
                newest.avgPosition.kind === "ok" || newest.avgPosition.kind === "unverified"
                  ? formatPosition(newest.avgPosition.value)
                  : "—"
              }
              subtitle="Lower is better"
              footer={<DeltaLine delta={positionDelta} higherIsBetter={false} />}
            />
            <SeoMetricTile
              label="Organic keywords"
              value={row.organicKeywords.kind === "ok" || row.organicKeywords.kind === "unverified" ? formatInteger(row.organicKeywords.value) : "—"}
              subtitle={top3Keywords !== null ? `Tracked in Ahrefs · ${formatInteger(top3Keywords)} in top 3` : "Tracked in Ahrefs"}
              footer={
                keywordsGained !== null || keywordsLost !== null ? (
                  <CountLine value={(keywordsGained ?? 0) - (keywordsLost ?? 0)} label="net this month" />
                ) : undefined
              }
            />
            <SeoMetricTile
              label="Referring domains"
              value={row.referringDomains.kind === "ok" || row.referringDomains.kind === "unverified" ? formatInteger(row.referringDomains.value) : "—"}
              subtitle="Linking domains (Ahrefs)"
              footer={row.newReferringDomains !== null ? <CountLine value={row.newReferringDomains} label="this month" /> : undefined}
            />
          </section>

          <SeoAiSuggestions clientId={row.clientId} />

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Clicks by month</h3>
              {row.avg3 !== null && (
                <span className="text-xs text-muted-foreground">3-mo avg: {formatInteger(row.avg3)}</span>
              )}
            </div>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {row.months.map((m) => (
                <div key={m.month} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-foreground">{m.month}</span>
                  <DataCell state={m.clicks} format={formatInteger} />
                </div>
              ))}
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
