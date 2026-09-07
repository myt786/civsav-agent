import Link from "next/link";
import { HealthLabel, PageHeader } from "@/components/workspace-ui";
import {
  HEALTH_LABELS,
  ISSUE_GUIDES,
  type Health,
} from "@/lib/dashboard/portfolio";
import {
  PLATFORM_HELP,
  PLATFORM_LABELS,
  PLATFORM_ORDER,
} from "@/lib/connectors/platform-labels";
import { STALE_HOURS } from "@/lib/dashboard/constants";

export const metadata = {
  title: "Help",
  description: "Understand client health, metrics, and connected platforms.",
};
const TOC = [
  { id: "health", label: "Client health" },
  { id: "numbers", label: "Reading a number" },
  { id: "compare", label: "Reporting periods" },
  { id: "metrics", label: "Metric definitions" },
  { id: "verify", label: "Verification" },
  { id: "sync", label: "Data sync" },
  { id: "freshness", label: "Data freshness" },
  { id: "insights", label: "Insights & forecasts" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "platforms", label: "Connected platforms" },
];
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-8 border-b border-border pb-9 last:border-b-0"
    >
      <h2 className="mb-4 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-4 text-sm leading-7 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}
export default function DocsPage() {
  return (
    <div className="workspace">
      <PageHeader
        eyebrow="The workspace guide"
        title="Help & guidance"
        description="Understand what you’re seeing, how the numbers work, and what to do next."
      />
      <nav
        aria-label="Help contents"
        className="flex flex-wrap gap-x-4 gap-y-2 border-y border-border py-4 text-xs lg:hidden"
      >
        {TOC.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="hover:text-primary">
            {item.label}
          </a>
        ))}
      </nav>
      <div className="grid items-start gap-10 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="sticky top-9 hidden lg:block">
          <p className="eyebrow mb-4">In this guide</p>
          <nav aria-label="Help contents" className="flex flex-col gap-1">
            {TOC.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <Link href="/" className="quiet-link mt-8 inline-block">
            ← Back to overview
          </Link>
        </aside>
        <div className="panel flex min-w-0 max-w-4xl flex-col gap-9 p-6 lg:p-9">
          <Section id="health" title="What client health tells you">
            <p>
              Health summarizes the issues detected in available data. It is not
              a score or a complete assessment of the business.
            </p>
            <div className="divide-y divide-border">
              {Object.keys(HEALTH_LABELS).map((key) => (
                <div
                  key={key}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-6"
                >
                  <div className="min-w-40">
                    <HealthLabel health={key as Health} />
                  </div>
                  <p className="leading-6">
                    {key === "critical"
                      ? "At least one metric failed to sync. Review the connection error before relying on the affected number."
                      : key === "attention"
                        ? "A performance change or stale sync needs investigation. Open the client to see the evidence and suggested next steps."
                        : key === "insufficient"
                          ? "There are no usable metrics, or no successful sync has been recorded yet."
                          : "No existing rule has flagged this client. Missing data and short histories can limit what we can check."}
                  </p>
                </div>
              ))}
            </div>
            <p>
              Critical issues take priority over warnings. Coverage is shown
              separately: a client with only some metrics available can still
              have no detected issues.
            </p>
          </Section>
          <Section id="numbers" title="A missing number is not a zero">
            <div className="divide-y divide-border">
              {[
                {
                  value: "1,204",
                  title: "Verified value",
                  body: "A real value with verified source data and mapping.",
                },
                {
                  value: "1,204 ◦",
                  title: "Unverified value",
                  body: "A real synced number that has not been fully verified. The small circle explains its status on hover or keyboard focus.",
                },
                {
                  value: "—",
                  title: "No data",
                  body: "No usable value is available for this period. It does not mean the business had zero activity.",
                },
                {
                  value: "Error",
                  title: "Sync failed",
                  body: "The latest fetch failed. Focus or hover the error for details, then review the client’s Connections tab.",
                },
              ].map((state) => (
                <div
                  key={state.title}
                  className="grid gap-2 py-4 sm:grid-cols-[95px_1fr]"
                >
                  <span className="font-mono text-lg text-foreground">
                    {state.value}
                  </span>
                  <div>
                    <strong>{state.title}</strong>
                    <p>{state.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <p>
              Portfolio totals include available values only. Their coverage
              labels show how many clients contributed, and whether unverified
              values are included.
            </p>
          </Section>
          <Section id="compare" title="Compare like with like">
            <p>
              <strong>Last 7 full days:</strong> totals exclude today because it
              is incomplete. Each client’s timezone determines the reporting
              dates.
            </p>
            <p>
              <strong>Lead change:</strong> compares those seven days with the
              seven immediately before them. Changes within ±5% are shown
              neutrally. An unavailable or zero baseline produces no percentage.
            </p>
            <p>
              <strong>30-day trends:</strong> open a client to see daily
              history. Gaps stay as gaps. Portfolio charts combine each client’s
              local calendar dates and should be used for direction rather than
              precise cross-timezone daily comparisons.
            </p>
          </Section>
          <Section id="metrics" title="How the metrics are calculated">
            <dl className="divide-y divide-border">
              {[
                [
                  "Leads",
                  "Daily lead counts from Lead Dashboard, summed over the seven-day window.",
                ],
                [
                  "Calls and missed calls",
                  "OpenPhone call totals. Missed calls exclude calls forwarded and answered elsewhere.",
                ],
                [
                  "Ad spend",
                  "Google Ads cost plus Meta Ads spend for the same period.",
                ],
                [
                  "Cost per lead",
                  "Ad spend divided by leads. No leads means an unavailable cost per lead, never a false $0.",
                ],
                [
                  "Website sessions and conversions",
                  "Daily sessions and conversion events reported by GA4, summed over the window.",
                ],
                [
                  "Average search position",
                  "Search Console position averaged across days with data. A lower number means a better ranking.",
                ],
                [
                  "Last success",
                  "The most recent stored successful metric snapshot across this client’s platforms. It is separate from the latest fetch attempt.",
                ],
              ].map(([title, body]) => (
                <div key={title} className="py-3">
                  <dt className="font-medium text-foreground">{title}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
          </Section>
          <Section id="verify" title="Check that a connection is correct">
            <p>
              Open{" "}
              <Link href="/settings/clients" className="quiet-link">
                Settings
              </Link>
              , choose a client, and open Connections. Select the correct
              platform account and use <strong>Verify</strong> to test the
              mapping.
            </p>
            <p>
              A verification can return a value, no data, or an error. No data
              may be normal for a quiet account; an error needs investigation. A
              verified mapping does not automatically verify every historical
              data point.
            </p>
          </Section>
          <Section id="sync" title="How data reaches the workspace">
            <p>
              Scheduled syncs fetch yesterday’s data in each active client’s
              timezone. Active platform mappings determine which connections
              run. <strong>Sync now</strong> in Settings requests the same
              process on demand.
            </p>
            <p>
              The result can be completed, completed with errors, or failed.
              Inspect individual platform results when only part of a run
              succeeds. On-demand syncs do not backfill older missing days.
            </p>
            <p>
              Deactivating a client stops future syncs and removes it from the
              active overview, while retaining its history and configuration.
            </p>
          </Section>
          <Section id="freshness" title="Know how recent your data is">
            <p>
              A successful sync older than <strong>{STALE_HOURS} hours</strong>{" "}
              triggers a stale-data warning. The client page shows both the last
              success and latest attempt, so a recent failed request cannot make
              older data appear current.
            </p>
            <p>
              Last success records when data was successfully stored from any
              client platform. An empty response does not refresh it. It does
              not certify that every connection is current. Check individual
              errors and source coverage before making a decision.
            </p>
          </Section>
          <Section id="insights" title="Signals first. Interpretation second.">
            <p>
              The{" "}
              <Link href="/insights" className="quiet-link">
                issue queue
              </Link>{" "}
              uses the same rules as client health. Filter by client, severity,
              or issue type, then select Investigate to open its evidence.
            </p>
            <p>
              <strong>Rules:</strong> failed syncs are critical; stale syncs and
              lead declines beyond the 5% noise band are warnings. Missed calls
              trigger above 30% on at least five calls. Search position, spend,
              and session anomalies compare the latest week against that
              client’s earlier thirty-day history using its normal variation;
              short baselines are skipped.
            </p>
            <p>
              <strong>Forecasts:</strong> seven-day linear projections from the
              last thirty days. They require at least five known days and never
              project negative values. They are estimates, not targets or
              promises.
            </p>
            <p>
              <strong>AI summary:</strong> generated only when requested, using
              existing metrics and flags. Review its interpretation against the
              source figures.
            </p>
            <p>
              <strong>Assistant:</strong> open Ask the assistant in the sidebar,
              or the chat button on mobile. It looks up data through read-only
              tools and does not change campaigns or resolve issues for you.
            </p>
          </Section>
          <Section id="troubleshooting" title="From an issue to your next step">
            <div className="divide-y divide-border">
              {Object.entries(ISSUE_GUIDES).map(([key, guide]) => (
                <div key={key} className="py-4">
                  <h3 className="font-medium text-foreground">{guide.title}</h3>
                  <p>{guide.step}</p>
                </div>
              ))}
            </div>
          </Section>
          <Section id="platforms" title="Your connected platforms">
            <p>
              Platforms can be connected independently for each client. An
              absent connection limits coverage; it does not indicate a failed
              business metric.
            </p>
            <div className="divide-y divide-border">
              {PLATFORM_ORDER.map((platform) => (
                <div key={platform} className="py-4">
                  <h3 className="font-medium text-foreground">
                    {PLATFORM_LABELS[platform]}
                  </h3>
                  <p>{PLATFORM_HELP[platform].what}</p>
                  <p className="mt-2 text-xs leading-6">
                    <strong>If empty: </strong>
                    {PLATFORM_HELP[platform].ifEmpty}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
