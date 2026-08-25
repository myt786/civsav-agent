"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataCell } from "./data-cell";
import { Sparkline } from "./sparkline-chart";
import { PLATFORM_LABELS } from "@/lib/dashboard/constants";
import { formatCurrency, formatInteger, formatPosition } from "@/lib/dashboard/format";
import type { ClientDetail, ClientRow, SourceBreakdownItem } from "@/lib/dashboard/types";

function unitFormatter(unit: SourceBreakdownItem["unit"]) {
  if (unit === "currency") return formatCurrency;
  if (unit === "position") return formatPosition;
  return formatInteger;
}

export function RowDetailSheet({
  open,
  onOpenChange,
  row,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ClientRow | null;
  detail: ClientDetail | undefined;
}) {
  if (!row || !detail) {
    return <Sheet open={open} onOpenChange={onOpenChange} />;
  }

  const byKey = Object.fromEntries(detail.sparklines.map((s) => [s.key, s]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>{row.clientName}</SheetTitle>
          <SheetDescription>30-day trend and source breakdown</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-6">
          <section>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Source breakdown (7d)
            </h3>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {detail.breakdown.map((item, i) => (
                <div key={`${item.platform}-${item.label}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="text-foreground">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{PLATFORM_LABELS[item.platform]}</span>
                  </div>
                  <DataCell state={item.cell} format={unitFormatter(item.unit)} />
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-5">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">30-day trend</h3>

            <SparklineBlock label="Leads">
              <Sparkline
                series={[{ label: "Leads", points: byKey.leads.points, stroke: "var(--chart-1)" }]}
                formatValue={formatInteger}
              />
            </SparklineBlock>

            <SparklineBlock label="Calls">
              <Sparkline
                series={[
                  { label: "Total", points: byKey.callsTotal.points, stroke: "var(--chart-2)" },
                  { label: "Missed", points: byKey.callsMissed.points, stroke: "var(--destructive)" },
                ]}
                formatValue={formatInteger}
              />
            </SparklineBlock>

            <SparklineBlock label="Spend">
              <Sparkline
                series={[{ label: "Spend", points: byKey.spend.points, stroke: "var(--chart-3)" }]}
                formatValue={formatCurrency}
              />
            </SparklineBlock>

            <SparklineBlock label="Sessions">
              <Sparkline
                series={[{ label: "Sessions", points: byKey.sessions.points, stroke: "var(--chart-4)" }]}
                formatValue={formatInteger}
              />
            </SparklineBlock>

            <SparklineBlock label="Conversions">
              <Sparkline
                series={[{ label: "Conversions", points: byKey.conversions.points, stroke: "var(--chart-5)" }]}
                formatValue={formatInteger}
              />
            </SparklineBlock>

            <SparklineBlock label="Avg. position" caption="lower is better">
              <Sparkline
                series={[{ label: "Position", points: byKey.avgPosition.points, stroke: "var(--chart-6)" }]}
                formatValue={formatPosition}
              />
            </SparklineBlock>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SparklineBlock({
  label,
  caption,
  children,
}: {
  label: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-foreground">{label}</span>
        {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      </div>
      {children}
    </div>
  );
}
