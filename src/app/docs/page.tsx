import Link from "next/link";
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, ClockAlertIcon, MinusCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NavBrand } from "@/components/nav-brand";
import { PLATFORM_HELP, PLATFORM_LABELS, PLATFORM_ORDER } from "@/lib/connectors/platform-labels";
import { STALE_HOURS } from "@/lib/dashboard/constants";

export const metadata = {
  title: "Docs — Client Dashboard",
  description: "What the numbers, badges, and sync states on the dashboard mean.",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <div className="flex flex-col gap-3 text-sm text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Swatch({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex min-w-32 items-center">{children}</div>
      <span className="text-sm text-muted-foreground">{caption}</span>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="flex flex-col">
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-3">
          <NavBrand />
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground hover:underline">
              Dashboard
            </Link>
            <Link href="/settings/clients" className="text-muted-foreground hover:text-foreground hover:underline">
              Settings
            </Link>
          </nav>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">Reference</p>
        <h1 className="text-2xl font-medium text-foreground">Understanding the dashboard</h1>
        <p className="text-sm text-muted-foreground">
          What every badge, icon, and status on the client dashboard and settings pages means — and what to do about
          it.
        </p>
        <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href="#numbers" className="text-primary hover:underline">
            Reading a number
          </a>
          <a href="#verify" className="text-primary hover:underline">
            Verified vs. unverified
          </a>
          <a href="#sync" className="text-primary hover:underline">
            Sync status
          </a>
          <a href="#freshness" className="text-primary hover:underline">
            Freshness
          </a>
          <a href="#platforms" className="text-primary hover:underline">
            Connected platforms
          </a>
        </nav>
      </header>

      <Section id="numbers" title="Reading a number">
        <p>
          Every metric on the dashboard — leads, calls, spend, sessions — can be in one of four states. They&apos;re drawn
          deliberately differently so one is never mistaken for another; a missing number and a real zero are never
          the same thing here.
        </p>
        <div className="flex flex-col gap-2">
          <Swatch caption="A confirmed, real number — the mapping behind it has been Verified at least once.">
            <span className="font-mono tabular-nums text-foreground">1,204</span>
          </Swatch>
          <Swatch caption="A real number pulled from a live sync, but nobody has clicked Verify on this mapping yet — treat with a little less certainty.">
            <span className="flex items-center gap-1.5 font-mono tabular-nums text-muted-foreground italic">
              1,204
              <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] font-sans leading-none not-italic">
                unverified
              </Badge>
            </span>
          </Swatch>
          <Swatch caption="No data — the platform genuinely reported nothing for this period. Not an error, not a zero.">
            <span className="font-mono tabular-nums text-muted-foreground/50">—</span>
          </Swatch>
          <Swatch caption="Sync error — the connector failed to fetch. Hover the warning icon on the dashboard to see why.">
            <span className="flex items-center gap-1 font-mono tabular-nums text-destructive">
              <AlertTriangleIcon className="size-3.5" aria-hidden />
              <span className="text-xs">error</span>
            </span>
          </Swatch>
        </div>
      </Section>

      <Section id="verify" title="Verified vs. unverified">
        <p>
          Each client&apos;s platform connection (in <Link href="/settings/clients" className="text-primary hover:underline">Settings</Link>) carries its own status, set by clicking{" "}
          <strong>Verify</strong> on that mapping — which runs the real connector against the last 7 days and shows
          you the actual figures it got back.
        </p>
        <div className="flex flex-col gap-2">
          <Swatch caption="Nobody has run Verify on this mapping since it was created or last changed.">
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <CircleIcon className="size-3" />
              not verified
            </Badge>
          </Swatch>
          <Swatch caption="Verify ran and returned real figures — this mapping is confirmed correct.">
            <Badge variant="outline" className="gap-1 border-emerald-600/30 text-emerald-700 dark:text-emerald-500">
              <CheckCircle2Icon className="size-3" />
              verified
            </Badge>
          </Swatch>
          <Swatch caption="Verify ran successfully but the platform returned nothing for the test period — often normal for a quiet client, worth a second look if unexpected.">
            <Badge variant="outline" className="gap-1 border-amber-600/30 text-amber-700 dark:text-amber-500">
              <MinusCircleIcon className="size-3" />
              no data
            </Badge>
          </Swatch>
          <Swatch caption="Verify failed — the external API rejected the request or errored. Hover it in Settings for the exact message.">
            <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
              <AlertTriangleIcon className="size-3" />
              error
            </Badge>
          </Swatch>
        </div>
        <p>
          A dashboard cell shows the <strong>unverified</strong> badge specifically when real synced data exists for
          that platform but its mapping has never been through a successful Verify — the number is probably right,
          it just hasn&apos;t been double-checked by a human yet.
        </p>
      </Section>

      <Section id="sync" title="Sync status">
        <p>
          <strong>Last sync run</strong> (shown at the top of the dashboard and in Settings) reports on the most
          recent time data was pulled from every connected platform for every active client — automatically, once a
          day, plus on demand.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>never</strong> — no sync has ever run.
          </li>
          <li>
            <strong>completed</strong> — every platform for every client synced without error.
          </li>
          <li>
            <strong>completed with errors</strong> — some platforms failed; others still updated normally. Check the
            per-platform strip for which ones.
          </li>
          <li>
            <strong>failed</strong> — every attempt in that run errored.
          </li>
        </ul>
        <p>
          Syncing happens automatically once a day. In <Link href="/settings/clients" className="text-primary hover:underline">Settings</Link>, a{" "}
          <strong>Sync now</strong> button also triggers one on demand — useful right after fixing a broken mapping,
          without waiting for the next scheduled run.
        </p>
      </Section>

      <Section id="freshness" title="Freshness">
        <p>
          Each client row shows when its data was last synced. If it&apos;s gone stale — more than {STALE_HOURS} hours
          since the last successful sync — a warning icon appears next to it:
        </p>
        <Swatch caption={`Last synced over ${STALE_HOURS}h ago — worth checking why the next scheduled sync hasn't picked it up.`}>
          <span className="flex items-center gap-1.5 font-mono text-destructive">
            <ClockAlertIcon className="size-3.5" aria-hidden />
            18h ago
          </span>
        </Swatch>
      </Section>

      <Section id="platforms" title="Connected platforms">
        <p>
          Each client can be connected to any of these. What breaks and how to fix it, in plain terms — the same
          text shown next to each row in Settings.
        </p>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {PLATFORM_ORDER.map((platform) => (
            <div key={platform} className="flex flex-col gap-1.5 px-4 py-3">
              <span className="text-sm font-medium text-foreground">{PLATFORM_LABELS[platform]}</span>
              <p className="text-sm text-muted-foreground">{PLATFORM_HELP[platform].what}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">If empty: </span>
                {PLATFORM_HELP[platform].ifEmpty}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
        <Link href="/" className="text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </footer>
      </div>
    </div>
  );
}
