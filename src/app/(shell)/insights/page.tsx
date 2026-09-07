import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { getForecastPage, getIssuePage } from "@/lib/dashboard/views";
import {
  ISSUE_GUIDES,
  param,
  queryHref,
  type SearchParams,
} from "@/lib/dashboard/portfolio";
import { AiSummary } from "@/components/insights/ai-summary";
import { ForecastChart } from "@/components/insights/forecast-chart";
import {
  EmptyState,
  FilterForm,
  HealthLabel,
  PageHeader,
  Pagination,
} from "@/components/workspace-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tab = ["summary", "forecasts"].includes(param(params, "tab"))
    ? param(params, "tab")
    : "issues";
  return (
    <div className="workspace">
      <PageHeader
        eyebrow="Focus on what matters"
        title="Insights"
        description="The signals worth investigating, with a clear path to each client."
      />
      <nav
        aria-label="Insights views"
        className="flex gap-7 border-b border-border"
      >
        {[
          ["issues", "Issue queue"],
          ["summary", "AI summary"],
          ["forecasts", "Forecasts"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={queryHref("/insights", {}, { tab: key })}
            aria-current={tab === key ? "page" : undefined}
            className="nav-tab"
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "issues" ? (
        <IssueQueue params={params} />
      ) : tab === "forecasts" ? (
        <Forecasts params={params} />
      ) : (
        <section className="max-w-3xl">
          <h2 className="section-title mb-2">
            A second perspective on your portfolio
          </h2>
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            Generate a summary of the same metrics and issues available in the
            overview. Use it as context for your own review.
          </p>
          <AiSummary />
        </section>
      )}
    </div>
  );
}
async function IssueQueue({ params }: { params: SearchParams }) {
  const data = await getIssuePage(params);
  return (
    <section className="panel overflow-hidden">
      <div className="p-5">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="section-title">Needs a closer look</h2>
          <p className="text-xs text-muted-foreground">
            {data.issueCount} issues across {data.affectedClients} clients
          </p>
        </div>
        <FilterForm path="/insights" params={params}>
          <select
            key={param(params, "severity")}
            name="severity"
            defaultValue={param(params, "severity")}
            aria-label="Issue severity"
            className="field-control"
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Needs attention</option>
          </select>
          <select
            key={param(params, "kind")}
            name="kind"
            defaultValue={param(params, "kind")}
            aria-label="Issue type"
            className="field-control max-w-full"
          >
            <option value="">All issue types</option>
            {Object.entries(ISSUE_GUIDES).map(([key, value]) => (
              <option key={key} value={key}>
                {value.title}
              </option>
            ))}
          </select>
        </FilterForm>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {data.items.map((flag) => (
          <article
            key={`${flag.clientId}-${flag.kind}`}
            className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 hover:bg-muted/30"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                  href={`/clients/${flag.clientId}#issue-${flag.kind}`}
                  prefetch={false}
                  className="text-sm font-semibold hover:text-primary"
                >
                  {flag.clientName}
                </Link>
                <HealthLabel
                  health={
                    flag.severity === "critical" ? "critical" : "attention"
                  }
                />
              </div>
              <h3 className="text-[13px] font-medium">
                {ISSUE_GUIDES[flag.kind].title}
              </h3>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                {flag.message}
              </p>
            </div>
            <Link
              href={`/clients/${flag.clientId}#issue-${flag.kind}`}
              prefetch={false}
              className="quiet-link inline-flex items-center gap-1.5"
            >
              Investigate
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
          </article>
        ))}
      </div>
      {!data.items.length && (
        <EmptyState
          title={
            data.issueCount
              ? "No issues match these filters"
              : "Nothing flagged right now"
          }
          description={
            data.issueCount
              ? "Clear the filters to return to the full issue queue."
              : "No issues were detected in available data. Check the overview for clients with missing or incomplete data."
          }
          href={data.issueCount ? "/insights" : "/"}
          action={data.issueCount ? "Clear filters" : "View portfolio"}
        />
      )}
      <Pagination path="/insights" params={params} {...data} noun="issues" />
    </section>
  );
}
async function Forecasts({ params }: { params: SearchParams }) {
  const data = await getForecastPage(params);
  return (
    <section>
      <div className="mb-5">
        <h2 className="section-title">A look at the week ahead</h2>
        <p className="mb-5 mt-2 text-sm text-muted-foreground">
          Seven-day projections based on the last 30 days. Projections indicate
          direction, not guaranteed results.
        </p>
        <FilterForm path="/insights" params={params}>
          <select
            key={param(params, "metric")}
            name="metric"
            aria-label="Forecast metric"
            className="field-control"
            defaultValue={param(params, "metric", "leads")}
          >
            <option value="leads">Leads</option>
            <option value="spend">Spend</option>
          </select>
        </FilterForm>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {data.items.map((f) => (
          <div key={f.clientId} className="panel p-4">
            <div className="mb-3 text-right">
              <Link
                href={`/clients/${f.clientId}#${f.metric.key}`}
                prefetch={false}
                className="quiet-link"
              >
                Client detail ↗
              </Link>
            </div>
            <ForecastChart clientName={f.clientName} metric={f.metric} />
          </div>
        ))}
      </div>
      {!data.items.length && (
        <EmptyState
          title="No clients to forecast"
          description="Try another search or add a client to your portfolio."
        />
      )}
      <div className="mt-5">
        <Pagination
          path="/insights"
          params={params}
          {...data}
          noun="forecasts"
        />
      </div>
    </section>
  );
}
