import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import type { AttentionFlag } from "@/lib/insights/types";
import { ISSUE_GUIDES } from "@/lib/dashboard/portfolio";
import { HealthLabel } from "@/components/workspace-ui";

export function ClientIssues({
  flags,
  clientId,
}: {
  flags: AttentionFlag[];
  clientId: string;
}) {
  return (
    <section id="issues" className="scroll-mt-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="section-title">Where to focus</h2>
        <span className="text-xs text-muted-foreground">
          {flags.length} {flags.length === 1 ? "issue" : "issues"} detected
        </span>
      </div>
      {flags.length ? (
        <div className="flex flex-col gap-3">
          {flags.map((flag) => {
            const guide = ISSUE_GUIDES[flag.kind];
            const connection = guide.section === "connections";
            return (
              <article
                id={`issue-${flag.kind}`}
                key={flag.kind}
                className="panel scroll-mt-6 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{guide.title}</h3>
                  <HealthLabel
                    health={
                      flag.severity === "critical" ? "critical" : "attention"
                    }
                  />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {flag.message}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {guide.period}
                </p>
                <div className="mt-4 border-t border-border pt-4">
                  <p className="eyebrow mb-2">Suggested next step</p>
                  <p className="max-w-3xl text-sm leading-relaxed">
                    {guide.step}
                  </p>
                  <Link
                    href={
                      connection
                        ? `/settings/clients/${clientId}?tab=connections`
                        : `#${guide.section}`
                    }
                    className="quiet-link mt-3 inline-flex items-center gap-1.5"
                  >
                    {connection
                      ? "Review connections"
                      : "Review supporting metrics"}
                    <ArrowUpRightIcon className="size-3.5" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel p-5">
          <p className="text-sm font-medium">
            No issues detected in available data
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This reflects the checks we can run, not a complete assessment of
            the business. Review missing connections and unverified values
            below.
          </p>
        </div>
      )}
    </section>
  );
}
