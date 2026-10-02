import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { AlertTriangleIcon, ArchiveIcon, ArrowLeftIcon, CheckCircle2Icon, ClockIcon, GlobeIcon, PauseIcon, PlugIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { metricSnapshots } from "@/lib/db/schema";
import { getClient, getClientMappings } from "@/lib/settings/queries";
import { isUuid } from "@/lib/settings/validation";
import { getRecentChanges } from "@/lib/settings/audit";
import { getAllDiscoveredAccounts } from "@/lib/connectors/discovery-cache";
import { getAccessInfo } from "@/lib/connectors/access-info";
import { ClientForm } from "@/components/settings/client-form";
import { MappingsSection } from "@/components/settings/mappings-section";
import { ClientActions } from "@/components/settings/client-actions";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";
import { updateClient } from "../../../actions";
import { PLATFORM_LABELS, PLATFORM_ORDER } from "@/lib/connectors/platform-labels";
import type { Platform } from "@/lib/connectors/types";

export const dynamic = "force-dynamic";

function formatChangeValue(value: string | null): string {
  if (value === null || value === "") return "nothing";
  if (value === "true") return "on";
  if (value === "false") return "off";
  return value.length > 60 ? `${value.slice(0, 60)}…` : value;
}

// The audit log stores database field names; this turns each entry into a
// sentence someone non-technical can read.
function describeChange(change: {
  platform: Platform | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}): string {
  const platform = change.platform ? PLATFORM_LABELS[change.platform] : null;
  if (change.field === "credential_label") {
    return `changed which ${platform ?? ""} access key is used`.replace("  ", " ");
  }
  if (change.field === "used") {
    return change.newValue === "false" ? `marked ${platform ?? "a platform"} as not used` : `marked ${platform ?? "a platform"} as used again`;
  }
  if (change.field === "archived") {
    return change.newValue === "true" ? "archived this client" : "restored this client from the archive";
  }
  if (change.field === "active") {
    const target = platform ? `${platform} updates` : "this client";
    return `turned ${target} ${formatChangeValue(change.newValue)}`;
  }
  const what =
    change.field === "external_id"
      ? `the ${platform ?? ""} account`.replace("  ", " ")
      : change.field === "name"
        ? "the name"
        : change.field === "timezone"
          ? "the timezone"
          : change.field.replace(/_/g, " ");
  if (change.oldValue === null) return `set ${what} to ${formatChangeValue(change.newValue)}`;
  return `changed ${what} from ${formatChangeValue(change.oldValue)} to ${formatChangeValue(change.newValue)}`;
}

async function getLastUpdatedAt(clientId: string): Promise<Date | null> {
  const db = await getDb();
  const [row] = await db
    .select({ last: sql<string | null>`max(${metricSnapshots.createdAt})` })
    .from(metricSnapshots)
    .where(eq(metricSnapshots.clientId, clientId));
  if (!row?.last) return null;
  const date = new Date(row.last);
  return Number.isNaN(date.getTime()) ? null : date;
}

const RECENT_CHANGES_SHOWN = 6;

type TileTone = "neutral" | "good" | "bad" | "warn";

const TILE_TONE: Record<TileTone, { icon: string; value: string }> = {
  neutral: { icon: "bg-primary/10 text-primary", value: "text-foreground" },
  good: { icon: "bg-success/10 text-success", value: "text-foreground" },
  bad: { icon: "bg-destructive/10 text-destructive", value: "text-destructive" },
  warn: { icon: "bg-warning/10 text-warning", value: "text-warning" },
};

function StatTile({
  label,
  value,
  icon,
  tone = "neutral",
  children,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: TileTone;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
          <span className={cn("font-heading text-2xl font-semibold tabular-nums", TILE_TONE[tone].value)}>{value}</span>
        </div>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TILE_TONE[tone].icon)}>{icon}</span>
      </div>
      {children}
    </div>
  );
}

// The platforms in one bucket as small chips, or a calm line when empty.
function PlatformChips({ platforms, chipClass, empty }: { platforms: Platform[]; chipClass: string; empty: React.ReactNode }) {
  if (platforms.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  const shown = platforms.slice(0, 4);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((p) => (
        <span key={p} className={cn("rounded-full px-2 py-0.5 text-xs leading-5 whitespace-nowrap", chipClass)}>
          {PLATFORM_LABELS[p]}
        </span>
      ))}
      {platforms.length > shown.length && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs leading-5 text-muted-foreground">+{platforms.length - shown.length}</span>
      )}
    </div>
  );
}

type SlotState = "working" | "broken" | "check" | "off" | "missing" | "unused";

const SLOT_STYLE: Record<SlotState, { bar: string; label: string }> = {
  working: { bar: "bg-success", label: "Working" },
  broken: { bar: "bg-destructive", label: "Not working" },
  check: { bar: "bg-warning", label: "Needs a check" },
  off: { bar: "bg-muted-foreground/30", label: "Turned off" },
  missing: { bar: "bg-muted", label: "Not connected" },
  unused: { bar: "border border-dashed border-muted-foreground/30 bg-transparent", label: "Not used" },
};

// One segment per platform, coloured by its state — the whole client's
// setup at a glance.
function PlatformMeter({ slots }: { slots: { platform: Platform; state: SlotState }[] }) {
  return (
    <div className="flex gap-1" role="img" aria-label={slots.map((s) => `${PLATFORM_LABELS[s.platform]}: ${SLOT_STYLE[s.state].label}`).join(", ")}>
      {slots.map((s) => (
        <span
          key={s.platform}
          title={`${PLATFORM_LABELS[s.platform]} — ${SLOT_STYLE[s.state].label}`}
          className={cn("h-2 flex-1 rounded-full", SLOT_STYLE[s.state].bar)}
        />
      ))}
    </div>
  );
}

function ChangeItem({ change }: { change: Parameters<typeof describeChange>[0] & { userEmail: string; changedAt: Date } }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-foreground">
        <span className="font-medium">{change.userEmail.split("@")[0]}</span> {describeChange(change)}
      </span>
      <time className="text-xs text-muted-foreground" dateTime={change.changedAt.toISOString()} title={change.changedAt.toLocaleString()}>
        {formatRelativeTime(change.changedAt, new Date())}
      </time>
    </li>
  );
}

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A mistyped or truncated link: a 404, not a database error page.
  if (!isUuid(id)) notFound();
  // The change history and "last updated" line are nice to have — a
  // failure in either shouldn't take the whole page down with it.
  const [client, mappings, changes, discovery, lastUpdatedAt] = await Promise.all([
    getClient(id),
    getClientMappings(id),
    getRecentChanges(id).catch((err) => {
      console.error("client page: recent changes failed", err);
      return [];
    }),
    getAllDiscoveredAccounts(),
    getLastUpdatedAt(id).catch((err) => {
      console.error("client page: last updated failed", err);
      return null;
    }),
  ]);
  if (!client) notFound();

  const archived = client.archivedAt !== null;
  const mappedPlatforms = new Set(mappings.map((m) => m.platform));
  const excludedPlatforms = PLATFORM_ORDER.filter(
    (p) => (client.excludedPlatforms ?? []).includes(p) && !mappedPlatforms.has(p),
  );
  const mappingByPlatform = new Map(
    mappings.map((m) => [
      m.platform,
      {
        externalId: m.externalId,
        active: m.active,
        credentialLabel: m.credentialLabel,
        verifiedAt: m.verifiedAt,
        verifiedStatus: m.verifiedStatus,
        lastError: m.lastError,
      },
    ]),
  );

  const connected = mappings.length;
  // Accounts switched off are kept but paused, so they don't count as
  // broken or waiting for a check.
  const turnedOn = mappings.filter((m) => m.active);
  const turnedOff = mappings.length - turnedOn.length;
  const inOrder = (list: typeof mappings) =>
    PLATFORM_ORDER.filter((p) => list.some((m) => m.platform === p));
  const workingPlatforms = inOrder(turnedOn.filter((m) => m.verifiedAt && m.verifiedStatus === "ok"));
  const brokenPlatforms = inOrder(turnedOn.filter((m) => m.verifiedAt && m.verifiedStatus === "error"));
  const checkPlatforms = inOrder(turnedOn.filter((m) => !m.verifiedAt || m.verifiedStatus === "no_data"));
  const working = workingPlatforms.length;
  const broken = brokenPlatforms.length;
  const quiet = turnedOn.filter((m) => m.verifiedAt && m.verifiedStatus === "no_data").length;
  const unchecked = turnedOn.filter((m) => !m.verifiedAt).length;
  const lastCheckedAt = turnedOn.reduce<Date | null>(
    (latest, m) => (m.verifiedAt && (!latest || m.verifiedAt > latest) ? m.verifiedAt : latest),
    null,
  );

  const status = archived
    ? { label: "Archived", className: "bg-muted text-muted-foreground" }
    : !client.active
      ? { label: "Paused", className: "bg-muted text-muted-foreground" }
      : broken > 0
        ? { label: "Needs attention", className: "bg-destructive/10 text-destructive" }
        : { label: "Active", className: "bg-success/10 text-success" };

  const usedCount = PLATFORM_ORDER.length - excludedPlatforms.length;
  const toConnect = PLATFORM_ORDER.filter((p) => !mappedPlatforms.has(p) && !excludedPlatforms.includes(p));
  const slots = PLATFORM_ORDER.map((platform) => {
    const m = mappings.find((x) => x.platform === platform);
    const state: SlotState = !m
      ? excludedPlatforms.includes(platform)
        ? "unused"
        : "missing"
      : !m.active
        ? "off"
        : !m.verifiedAt || m.verifiedStatus === "no_data"
          ? "check"
          : m.verifiedStatus === "error"
            ? "broken"
            : "working";
    return { platform, state };
  });

  const recent = changes.slice(0, RECENT_CHANGES_SHOWN);
  const older = changes.slice(RECENT_CHANGES_SHOWN);

  return (
    <div className="flex w-full flex-col gap-6">
      <Link
        href="/settings/clients"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        All clients
      </Link>

      <header className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-heading text-xl font-medium text-foreground">{client.name}</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>{status.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <GlobeIcon className="size-3.5" />
              {client.timezone}
            </span>
            <span className="flex items-center gap-1.5">
              <ClockIcon className="size-3.5" />
              {lastUpdatedAt ? `Numbers last updated ${formatRelativeTime(lastUpdatedAt, new Date())}` : "No numbers collected yet"}
            </span>
          </div>
        </div>
        <ClientActions clientId={client.id} clientName={client.name} active={client.active} archived={archived} />
      </header>

      {archived ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
          <ArchiveIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">
              Archived {formatRelativeTime(client.archivedAt!, new Date())}
            </span>
            <span className="text-muted-foreground">
              This client is paused and hidden from the dashboard, summaries and the daily and monthly updates.
              Everything collected so far is kept. Restore it to start collecting numbers again.
            </span>
          </div>
        </div>
      ) : (
        !client.active && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
            <PauseIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">Updates are paused</span>
              <span className="text-muted-foreground">
                No new numbers are collected for this client, and it&apos;s left out of the dashboard. Resume to
                start again.
              </span>
            </div>
          </div>
        )
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Accounts connected"
          value={`${connected} of ${usedCount}`}
          icon={<PlugIcon className="size-4" />}
          tone={toConnect.length === 0 ? "good" : "neutral"}
        >
          <PlatformMeter slots={slots} />
          <p className="text-xs text-muted-foreground">
            {[
              toConnect.length === 0
                ? "Everything this client uses is connected"
                : `To connect: ${toConnect.map((p) => PLATFORM_LABELS[p]).join(", ")}`,
              turnedOff > 0 ? `${turnedOff} turned off` : null,
              excludedPlatforms.length > 0 ? `${excludedPlatforms.length} not used` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </StatTile>
        <StatTile label="Working" value={String(working)} icon={<CheckCircle2Icon className="size-4" />} tone="good">
          <PlatformChips platforms={workingPlatforms} chipClass="bg-success/10 text-success" empty="Nothing confirmed working yet." />
        </StatTile>
        <StatTile
          label="Not working"
          value={String(broken)}
          icon={<AlertTriangleIcon className="size-4" />}
          tone={broken > 0 ? "bad" : "good"}
        >
          <PlatformChips
            platforms={brokenPlatforms}
            chipClass="bg-destructive/10 font-medium text-destructive"
            empty={
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2Icon className="size-3.5" /> Nothing to fix
              </span>
            }
          />
        </StatTile>
        <StatTile
          label="Needs a check"
          value={String(unchecked + quiet)}
          icon={<ClockIcon className="size-4" />}
          tone={unchecked + quiet > 0 ? "warn" : "good"}
        >
          <PlatformChips
            platforms={checkPlatforms}
            chipClass="bg-warning/10 text-warning"
            empty={lastCheckedAt ? `All checked · last ${formatRelativeTime(lastCheckedAt, new Date())}` : "Nothing connected to check yet."}
          />
          {quiet > 0 && <p className="text-xs text-muted-foreground">{quiet} connected but quiet lately</p>}
        </StatTile>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <MappingsSection
          clientId={client.id}
          clientName={client.name}
          initialDiscovery={discovery}
          mappingByPlatform={mappingByPlatform}
          accessInfo={getAccessInfo()}
          excludedPlatforms={excludedPlatforms}
        />

        <aside className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-medium text-foreground">Details</h3>
              <p className="text-xs text-muted-foreground">The timezone decides where each day starts and ends.</p>
            </div>
            <ClientForm
              action={updateClient.bind(null, client.id)}
              defaultValues={{ name: client.name, timezone: client.timezone, active: client.active }}
              submitLabel="Save details"
            />
          </section>

          <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-medium text-foreground">Recent changes</h3>
            {changes.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No changes recorded yet.</p>
            ) : (
              <>
                <ul className="flex flex-col">
                  {recent.map((change) => (
                    <ChangeItem key={change.id} change={change} />
                  ))}
                </ul>
                {older.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer list-none pt-1 text-xs font-medium text-muted-foreground hover:text-foreground group-open:hidden">
                      Show {older.length} older
                    </summary>
                    <ul className="flex flex-col">
                      {older.map((change) => (
                        <ChangeItem key={change.id} change={change} />
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
