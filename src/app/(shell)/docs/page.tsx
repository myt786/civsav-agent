import Link from "next/link";
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, ClockAlertIcon, MinusCircleIcon, SparklesIcon } from "lucide-react";
import { UnverifiedMark } from "@/components/dashboard/data-cell";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_HELP, PLATFORM_LABELS, PLATFORM_ORDER } from "@/lib/connectors/platform-labels";
import { STALE_HOURS } from "@/lib/dashboard/constants";

const TOC = [
  { id: "numbers", label: "Reading a number" },
  { id: "columns", label: "What each column means" },
  { id: "add-client", label: "Adding a new client" },
  { id: "accounts", label: "Is the right account connected?" },
  { id: "updates", label: "How often numbers update" },
  { id: "insights", label: "The Insights page" },
  { id: "platforms", label: "Connected platforms" },
];

export const metadata = {
  title: "Help — Client Dashboard",
  description: "How to read the dashboard, add clients, and fix common problems.",
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
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card shadow-sm px-3 py-2">
      <div className="flex min-w-32 items-center">{children}</div>
      <span className="text-sm text-muted-foreground">{caption}</span>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto grid w-full max-w-5xl animate-in grid-cols-1 gap-10 px-6 py-10 fade-in-0 duration-300 lg:grid-cols-[1fr_220px]">
      <div className="flex min-w-0 flex-col gap-10">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">Help</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">How to use the dashboard</h1>
        <p className="text-sm text-muted-foreground">
          What the numbers and icons mean, how to add a client, and what to do when something looks wrong.
        </p>
        <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm lg:hidden">
          {TOC.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="text-primary hover:underline">
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="numbers" title="Reading a number">
        <p>Every number on the dashboard looks like one of these:</p>
        <div className="flex flex-col gap-2">
          <Swatch caption="A normal number. Good to use.">
            <span className="font-mono tabular-nums text-foreground">1,204</span>
          </Swatch>
          <Swatch caption="A number with a small ring: probably right, but nobody has confirmed this client's account yet. See “Is the right account connected?” below.">
            <span className="flex items-center gap-1.5 font-mono tabular-nums text-foreground/85">
              1,204
              <UnverifiedMark />
            </span>
          </Swatch>
          <Swatch caption="A dash: nothing happened in this period (for example, no ads ran). It's not a mistake, and it's not the same as zero.">
            <span className="font-mono tabular-nums text-muted-foreground/50">—</span>
          </Swatch>
          <Swatch caption="A red warning: we couldn't get this number. Hover over it to see why.">
            <span className="flex items-center gap-1 font-mono tabular-nums text-destructive">
              <AlertTriangleIcon className="size-3.5" aria-hidden />
            </span>
          </Swatch>
        </div>
      </Section>

      <Section id="columns" title="What each column means">
        <p>
          Unless it says otherwise, every number covers the <strong>last 7 full days</strong>. Today isn&apos;t
          included yet because the day isn&apos;t over.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          {[
            { label: "Leads", body: "New leads, from the lead dashboard." },
            {
              label: "vs week before",
              body: "How leads this week compare with the week before. Small changes (under 5%) show as — because they're usually just normal ups and downs.",
            },
            {
              label: "Calls / Missed",
              body: "Phone calls from OpenPhone, and how many were missed. A call forwarded and answered somewhere else doesn't count as missed.",
            },
            { label: "Spend", body: "Money spent on Google Ads and Meta (Facebook/Instagram) ads, added together." },
            { label: "Cost per lead", body: "Ad spend divided by leads. Shows — when there were no leads." },
            { label: "Website visits", body: "Visits to the client's website, from Google Analytics." },
            { label: "Enquiries", body: "Form fills and other goals completed on the website, from Google Analytics." },
            {
              label: "Google rank",
              body: "Where the client's website shows up in Google search on average. Lower is better — 1 is the top result.",
            },
            { label: "Updated", body: "When this client's numbers were last updated." },
          ].map((row) => (
            <div key={row.label} className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0">
              <span className="text-sm font-medium text-foreground">{row.label}</span>
              <p className="text-sm text-muted-foreground">{row.body}</p>
            </div>
          ))}
        </div>
        <p>Click any client in the table to see their last 30 days as a chart.</p>
      </Section>

      <Section id="add-client" title="Adding a new client">
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            Go to{" "}
            <Link href="/settings/clients/new" className="text-primary hover:underline">
              Settings → Add client
            </Link>{" "}
            and type the client&apos;s name.
          </li>
          <li>
            We look for accounts with that name on every platform and fill them in for you. Check they&apos;re the
            right ones. Remove any that are wrong with ✕, or add a missing platform from the &ldquo;Add&rdquo;
            buttons.
          </li>
          <li>
            Click <strong>Create client</strong>. We check each account works and show the result on the
            client&apos;s page.
          </li>
          <li>
            GoHighLevel and OpenPhone need a key for each client first. On the client&apos;s page, click{" "}
            <strong>Add this client&apos;s GoHighLevel key</strong> and follow the steps shown.
          </li>
        </ol>
        <p>New clients&apos; numbers appear on the dashboard after the next daily update.</p>
      </Section>

      <Section id="accounts" title="Is the right account connected?">
        <p>
          On each client&apos;s page in{" "}
          <Link href="/settings/clients" className="text-primary hover:underline">
            Settings
          </Link>
          , every platform shows one of these. We check automatically when you create a client or save an account.
          Click <strong>Re-check</strong> (or <strong>Check all</strong>) to check again.
        </p>
        <div className="flex flex-col gap-2">
          <Swatch caption="Working — we can see this account's numbers.">
            <Badge variant="outline" className="gap-1 border-success/30 text-success">
              <CheckCircle2Icon className="size-3" />
              working
            </Badge>
          </Swatch>
          <Swatch caption="Connected, but nothing happened in the last 7 days. Normal for a quiet account — double-check it's the right one if that's unexpected.">
            <Badge variant="outline" className="gap-1 border-warning/30 text-warning">
              <MinusCircleIcon className="size-3" />
              connected, no activity
            </Badge>
          </Swatch>
          <Swatch caption="Not working — hover over it to see what's wrong and how to fix it.">
            <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
              <AlertTriangleIcon className="size-3" />
              not working
            </Badge>
          </Swatch>
          <Swatch caption="Not checked yet — click Check all accounts in Settings to check every client at once.">
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <CircleIcon className="size-3" />
              not checked yet
            </Badge>
          </Swatch>
        </div>
      </Section>

      <Section id="updates" title="How often numbers update">
        <p>
          Every morning we collect the previous day&apos;s numbers for every active client. You can also click{" "}
          <strong>Update data now</strong> in{" "}
          <Link href="/settings/clients" className="text-primary hover:underline">
            Settings
          </Link>{" "}
          — handy right after fixing an account, so you don&apos;t have to wait until tomorrow.
        </p>
        <p>
          The row of platforms under the charts shows when each one last updated. A red dot means some clients on
          that platform couldn&apos;t be updated last time — the Insights page lists them.
        </p>
        <Swatch caption={`If a client hasn't updated for more than ${STALE_HOURS} hours, its "Updated" time turns red. Check its accounts in Settings.`}>
          <span className="flex items-center gap-1.5 font-mono text-destructive">
            <ClockAlertIcon className="size-3.5" aria-hidden />
            40h ago
          </span>
        </Swatch>
      </Section>

      <Section id="insights" title="The Insights page">
        <p>
          <Link href="/insights" className="text-primary hover:underline">
            Insights
          </Link>{" "}
          uses the same numbers as the dashboard to point out what needs your attention.
        </p>

        <p className="text-foreground">Needs attention</p>
        <p>
          A list of clients where something looks off. The same clients get a warning icon next to their name on the
          dashboard:
        </p>
        <Swatch caption="Hover over the icon on the dashboard to see what's wrong.">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <AlertTriangleIcon className="size-3.5 text-warning" aria-hidden />
            Acme Roofing
          </span>
        </Swatch>
        <div className="overflow-hidden rounded-lg border border-border">
          {[
            { label: "Not updating", body: "We couldn't get some of this client's numbers. Usually an account needs fixing in Settings." },
            { label: "Out of date", body: `This client's numbers haven't updated in over ${STALE_HOURS} hours.` },
            { label: "Fewer leads", body: "Leads dropped by more than 5% compared with the week before." },
            { label: "Missed calls", body: "More than 30% of this week's calls were missed (only checked when there were at least 5 calls)." },
            {
              label: "Google ranking / Spend jump / Fewer visits",
              body: "This week is clearly different from what's normal for this client. We compare each client with their own usual numbers, so a client whose numbers always bounce around won't be flagged for a normal week.",
            },
          ].map((row) => (
            <div key={row.label} className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0">
              <span className="text-sm font-medium text-foreground">{row.label}</span>
              <p className="text-sm text-muted-foreground">{row.body}</p>
            </div>
          ))}
        </div>

        <p className="text-foreground">What to expect</p>
        <p>
          A best guess at each client&apos;s leads and ad spend over the next 7 days, based on the last 30 days. It
          only appears once there&apos;s enough data to make a sensible guess.
        </p>

        <p className="text-foreground">This week in brief</p>
        <p>
          <span className="inline-flex items-center gap-1 align-text-bottom">
            <SparklesIcon className="size-3.5 text-primary" aria-hidden />
          </span>{" "}
          Click <strong>Write summary</strong> for a short written summary of the week, written by AI. It only uses
          the numbers you can already see in the app.
        </p>

        <p className="text-foreground">Ask a question</p>
        <p>
          Click the sparkles icon at the top of any page to ask a question in plain English, like &ldquo;Who has
          the highest cost per lead?&rdquo;. It looks up the answer from the same numbers as the dashboard.
        </p>
      </Section>

      <Section id="platforms" title="Connected platforms">
        <p>What each platform gives us, and what to do if a client&apos;s account can&apos;t be found.</p>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {PLATFORM_ORDER.map((platform) => (
            <div key={platform} className="flex flex-col gap-1.5 px-4 py-3">
              <span className="text-sm font-medium text-foreground">{PLATFORM_LABELS[platform]}</span>
              <p className="text-sm text-muted-foreground">{PLATFORM_HELP[platform].what}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Can&apos;t find the account? </span>
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

      <aside className="hidden lg:block">
        <nav className="sticky top-8 flex flex-col gap-1 border-l border-border pl-4 text-sm">
          {TOC.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="text-muted-foreground hover:text-foreground">
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  );
}
