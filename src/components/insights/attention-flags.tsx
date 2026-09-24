import { AlertTriangleIcon, CheckCircle2Icon, ExternalLinkIcon } from "lucide-react";
import { ClientChips } from "./client-chips";
import { cn } from "@/lib/utils";
import type { AttentionFlag } from "@/lib/insights/types";

const KIND_LABEL: Record<AttentionFlag["kind"], string> = {
  sync_error: "Sync error",
  stale_sync: "Stale sync",
  leads_down: "Leads down",
  missed_calls_high: "Missed calls",
  position_worsening: "SEO position",
  spend_spike: "Spend spike",
  sessions_drop: "Sessions drop",
};

const URL_RE = /https?:\/\/[^\s)]+[^\s).,]/g;

// Strips the per-client parts of a message (quoted site names, help URLs)
// so the same underlying failure across many clients collapses into one
// group — e.g. 15 near-identical "no permission for site 'x'" errors.
function normalizeMessage(message: string): string {
  return message
    .replace(/\s*See also:\s*\S+/gi, "")
    .replace(/\s+for site '[^']*'/gi, " for the site")
    .replace(/'[^']*'/g, "…")
    .replace(URL_RE, "")
    .trim();
}

interface FlagGroup {
  key: string;
  kind: AttentionFlag["kind"];
  severity: AttentionFlag["severity"];
  message: string;
  helpUrl: string | null;
  flags: AttentionFlag[];
}

// Only failures that read the same for every client are grouped: sync
// errors (same upstream error) and stale syncs. Metric flags (leads down,
// spend spike, …) carry client-specific numbers and stay one row each.
function groupFlags(flags: AttentionFlag[]): FlagGroup[] {
  const groups = new Map<string, FlagGroup>();
  flags.forEach((flag, i) => {
    const groupable = flag.kind === "sync_error" || flag.kind === "stale_sync";
    const message = flag.kind === "stale_sync" ? "No successful sync within the freshness window" : normalizeMessage(flag.message);
    const key = groupable ? `${flag.kind}|${flag.severity}|${message}` : `${flag.clientId}|${flag.kind}|${i}`;
    const existing = groups.get(key);
    if (existing) {
      existing.flags.push(flag);
      return;
    }
    groups.set(key, {
      key,
      kind: flag.kind,
      severity: flag.severity,
      message: groupable ? message : flag.message,
      helpUrl: flag.message.match(URL_RE)?.[0] ?? null,
      flags: [flag],
    });
  });
  return [...groups.values()].sort((a, b) =>
    a.severity !== b.severity ? (a.severity === "critical" ? -1 : 1) : b.flags.length - a.flags.length,
  );
}

function FlagGroupRow({ group }: { group: FlagGroup }) {
  const single = group.flags.length === 1;
  const critical = group.severity === "critical";
  // A lone flag keeps its original, client-specific wording; a group shows
  // the shared wording once and the affected clients underneath.
  const message = single ? normalizeMessage(group.flags[0].message) : group.message;

  return (
    <div
      className={cn(
        "flex items-start gap-3 border-l-2 px-4 py-3 text-sm",
        critical ? "border-l-destructive bg-destructive/[0.03]" : "border-l-warning bg-warning/[0.03]",
      )}
    >
      <AlertTriangleIcon
        className={cn("mt-0.5 size-4 shrink-0", critical ? "text-destructive" : "text-warning")}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground">
            {single ? group.flags[0].clientName : `${group.flags.length} clients`}
          </span>
          <span
            className={cn(
              "text-[10px] font-medium tracking-wide uppercase",
              critical ? "text-destructive" : "text-warning",
            )}
          >
            {KIND_LABEL[group.kind]}
          </span>
        </div>
        <span className="text-muted-foreground">
          {message}
          {group.helpUrl && (
            <>
              {" "}
              <a
                href={group.helpUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                How to fix
                <ExternalLinkIcon className="size-3" aria-hidden />
              </a>
            </>
          )}
        </span>
        {!single && <ClientChips names={group.flags.map((f) => f.clientName)} />}
      </div>
    </div>
  );
}

// Deterministic, rule-based flags — computed from the same cells the table
// already renders, so this list needs no model call and is exact, not a
// best guess. The AI summary panel narrates these; it never invents its own.
export function AttentionFlags({ flags }: { flags: AttentionFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card shadow-sm px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2Icon className="size-4 shrink-0 text-success" aria-hidden />
        Nothing needs attention this week.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {groupFlags(flags).map((group) => (
        <FlagGroupRow key={group.key} group={group} />
      ))}
    </div>
  );
}
