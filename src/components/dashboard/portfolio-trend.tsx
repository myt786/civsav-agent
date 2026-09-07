"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FleetTrendChart } from "./fleet-trend-chart";
import type { DailyPoint } from "@/lib/dashboard/types";
export function PortfolioTrend({
  leads,
  spend,
}: {
  leads: DailyPoint[];
  spend: DailyPoint[];
}) {
  return (
    <section className="panel p-5">
      <Tabs defaultValue="leads">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">The bigger picture</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Portfolio trends · last 30 days
            </p>
          </div>
          <TabsList aria-label="Portfolio metric">
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="spend">Spend</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="leads">
          <FleetTrendChart
            title="Leads"
            points={leads}
            color="var(--chart-1)"
            formatKind="integer"
          />
        </TabsContent>
        <TabsContent value="spend">
          <FleetTrendChart
            title="Spend"
            points={spend}
            color="var(--chart-3)"
            formatKind="currency"
          />
        </TabsContent>
      </Tabs>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Available data only. Dates follow each client’s timezone; gaps are not
        zero values.
      </p>
    </section>
  );
}
