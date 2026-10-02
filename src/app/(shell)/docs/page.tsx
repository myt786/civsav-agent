import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  ClockAlertIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LightbulbIcon,
  MailIcon,
  PlugIcon,
  RefreshCwIcon,
  SettingsIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";
import { NotConnectedMark, UnverifiedMark } from "@/components/dashboard/data-cell";
import { PLATFORM_HELP, PLATFORM_LABELS, PLATFORM_ORDER } from "@/lib/connectors/platform-labels";
import { STALE_HOURS } from "@/lib/dashboard/constants";
import { cn } from "@/lib/utils";

const TOC: { id: string; label: string; group: string }[] = [
  { id: "start", label: "Where things are", group: "Basics" },
  { id: "numbers", label: "Reading a number", group: "Basics" },
  { id: "dashboard", label: "The dashboard", group: "Pages" },
  { id: "seo", label: "SEO & recommendations", group: "Pages" },
  { id: "insights", label: "Insights", group: "Pages" },
  { id: "clients", label: "Managing clients", group: "Settings" },
  { id: "accounts", label: "Connecting accounts", group: "Settings" },
  { id: "keys", label: "API keys", group: "Settings" },
  { id: "email", label: "Email reports", group: "Settings" },
  { id: "updates", label: "How often numbers update", group: "Reference" },
  { id: "platforms", label: "Connected platforms", group: "Reference" },
  { id: "faq", label: "Common questions", group: "Reference" },
];

export const metadata = {
  title: "Help — Civilized Savage",
  description: "How to read the dashboard, manage clients and accounts, and fix common problems.",
};

function Section({
  id,
  title,
  icon: Icon,
  lead,
  children,
}: {
  id: string;
  title: string;
  icon: typeof BookOpenIcon;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
          {lead && <p className="text-sm text-muted-foreground">{lead}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

// A two-column "term — meaning" list in a bordered card.
function Terms({ rows }: { rows: { term: React.ReactNode; body: React.ReactNode }[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {rows.map((row, i) => (
        <div key={i} className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <div className="flex items-center text-sm font-medium text-foreground">{row.term}</div>
          <div className="text-sm text-muted-foreground">{row.body}</div>
        </div>
      ))}
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {children.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 text-sm text-foreground">
      <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>{children}</div>
    </div>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-5 whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

function GoTo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {children}
      <ArrowRightIcon className="size-3" />
    </Link>
  );
}

const PAGES = [
  { href: "/", icon: LayoutDashboardIcon, title: "Dashboard", body: "Leads, calls, ad spend and website numbers for every client, last 7 days." },
  { href: "/seo", icon: TrendingUpIcon, title: "SEO", body: "Google clicks, rankings and keywords by month, plus AI to-do lists per client." },
  { href: "/insights", icon: SparklesIcon, title: "Insights", body: "Who needs a look today, what to expect next week, and a written summary." },
  { href: "/settings/clients", icon: SettingsIcon, title: "Settings", body: "Clients and their accounts, API keys, and who gets the email reports." },
];

export default function DocsPage() {
  const groups = [...new Set(TOC.map((t) => t.group))];
  return (
    <div className="mx-auto grid w-full max-w-6xl animate-in grid-cols-1 gap-10 px-6 py-10 fade-in-0 duration-300 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="flex min-w-0 flex-col gap-12">
        <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <span className="flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <BookOpenIcon className="size-3.5" />
            Help
          </span>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">How to use the dashboard</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            What the numbers and colours mean, how to set up a client and their accounts, and what to do when something
            looks wrong. Use the contents on the right to jump to a topic.
          </p>
          <nav className="mt-1 flex flex-wrap gap-1.5 lg:hidden">
            {TOC.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted">
                {item.label}
              </a>
            ))}
          </nav>
        </header>

        <Section id="start" title="Where things are" icon={BookOpenIcon} lead="Four pages, all in the menu on the left.">
          <div className="grid gap-3 sm:grid-cols-2">
            {PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="group flex gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary">
                  <page.icon className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{page.title}</span>
                  <span className="text-xs text-muted-foreground">{page.body}</span>
                </span>
              </Link>
            ))}
          </div>
          <Tip>
            Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-xs">⌘K</kbd> (or Ctrl+K) to jump
            to any client or page, and Ask AI under search in the sidebar to ask a question in plain English. The sidebar can be shrunk to icons with the panel button next to the logo.
          </Tip>
        </Section>

        <Section id="numbers" title="Reading a number" icon={BookOpenIcon} lead="Every cell on the dashboard is one of these five.">
          <Terms
            rows={[
              { term: <span className="font-mono tabular-nums">1,204</span>, body: "A normal number. Good to use." },
              {
                term: (
                  <span className="flex items-center gap-1.5 font-mono tabular-nums text-foreground/85">
                    1,204 <UnverifiedMark />
                  </span>
                ),
                body: "A small ring: probably right, but nobody has confirmed this client's account in Settings yet.",
              },
              {
                term: <span className="font-mono text-muted-foreground/60">—</span>,
                body: "A dash: the account is connected, but nothing happened this week (for example, no ads ran). Not a mistake, and not the same as zero.",
              },
              {
                term: <NotConnectedMark className="size-1.5" />,
                body: "A faint dot: no account is connected for this, so there's nothing to show. Connect one in Settings if the client uses it.",
              },
              {
                term: (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangleIcon className="size-3.5" /> red warning
                  </span>
                ),
                body: "We couldn't get this number. Hover over it to see why — usually an account needs access or a new key.",
              },
            ]}
          />
        </Section>

        <Section
          id="dashboard"
          title="The dashboard"
          icon={LayoutDashboardIcon}
          lead="Unless it says otherwise, every number covers the last 7 full days — today isn't counted until it's over."
        >
          <Terms
            rows={[
              {
                term: "Leads",
                body: (
                  <>
                    New leads from the Lead Dashboard. A client without one but with GoHighLevel uses GoHighLevel&apos;s new
                    opportunities instead, marked with a small <Pill className="bg-muted text-muted-foreground">GHL</Pill> tag.
                    When both are connected the Lead Dashboard is used and the two are never added together (that would
                    count the same lead twice) — the client&apos;s breakdown shows both side by side.
                  </>
                ),
              },
              { term: "vs week before", body: "Leads this week compared with the week before. Changes under 5% show as — because they're normal ups and downs." },
              { term: "Calls / Missed", body: "Calls from OpenPhone and how many were missed. A call forwarded and answered elsewhere doesn't count as missed." },
              { term: "Spend", body: "Google Ads and Meta (Facebook/Instagram) spend, added together." },
              { term: "Cost per lead", body: "Ad spend divided by leads. The total at the bottom only uses clients that have both." },
              { term: "Website visits / Enquiries", body: "Visits and completed goals (form fills and similar) from Google Analytics." },
              { term: "Google rank", body: "Average position in Google search, from Search Console. Lower is better — 1 is the top." },
              { term: "Updated", body: `When the client's numbers last arrived. Turns red after ${STALE_HOURS} hours.` },
            ]}
          />
          <Sub>Filters above the table</Sub>
          <Terms
            rows={[
              { term: "Needs attention", body: "Clients flagged on the Insights page — something isn't updating or a number changed sharply." },
              { term: "Running ads / Tracking calls / Website data", body: "Clients with ad spend, call tracking or Google Analytics numbers this week." },
              { term: "Not set up", body: "Clients with no leads, calls, ads or Google Analytics connected — usually SEO-only clients, or ones still being set up." },
            ]}
          />
          <p>
            Click any client for their last 30 days as charts and a breakdown by platform. The totals row at the bottom
            always adds up to the rows you can see.
          </p>
          <Tip>
            SEO-only clients can be taken off this page altogether — see <a href="#clients" className="font-medium text-primary hover:underline">Shows on</a> below.
          </Tip>
        </Section>

        <Section id="seo" title="SEO & recommendations" icon={TrendingUpIcon} lead="Monthly Google performance per client, from Search Console and Ahrefs.">
          <Sub>Portfolio</Sub>
          <p>Each client gets a size tier from last month&apos;s Google clicks, and a trend from the last three months:</p>
          <div className="flex flex-wrap gap-1.5">
            <Pill className="border border-success/30 bg-success/10 text-success">Strong</Pill>
            <Pill className="border border-primary/30 bg-primary/10 text-primary">Moderate</Pill>
            <Pill className="border border-warning/30 bg-warning/10 text-warning">Small</Pill>
            <Pill className="border border-destructive/30 bg-destructive/10 text-destructive">Minimal</Pill>
            <Pill className="border border-border bg-muted text-muted-foreground">No data</Pill>
          </div>
          <p>
            Trends read <strong>Growing fast</strong>, <strong>Growing</strong>, <strong>Stable</strong>,{" "}
            <strong>Declining</strong> or <strong>Falling fast</strong>. A client with very few clicks shows{" "}
            <strong>Too little data</strong> rather than a misleading trend. The current month isn&apos;t shown until it&apos;s over.
          </p>
          <Sub>Recommendations</Sub>
          <Steps>
            {[
              <>Open the <strong>Recommendations</strong> tab and press <strong>Write N missing</strong>, or <strong>Write</strong> on one client.</>,
              <>
                Each item has a priority, a type (content, on-page, technical, links, local), how much work it is, and the
                page or search it&apos;s about. It&apos;s written from the client&apos;s sitemap, real Search Console queries and the
                team&apos;s monthly notes.
              </>,
              <>Tick items off when done, or <strong>Dismiss</strong> ones that don&apos;t fit. Neither will be suggested again when the list is rewritten.</>,
              <>Lists older than 30 days are marked <strong>out of date</strong> — use <strong>Refresh out of date</strong> to rewrite them in one go. <strong>Copy list</strong> gives you plain text for email or Slack.</>,
            ]}
          </Steps>
        </Section>

        <Section id="insights" title="Insights" icon={SparklesIcon} lead="Uses the same numbers as the dashboard to point out what needs a look.">
          <Terms
            rows={[
              { term: "Not updating", body: "We couldn't get some of this client's numbers. Usually an account needs fixing in Settings." },
              { term: "Out of date", body: `Numbers haven't updated in over ${STALE_HOURS} hours (accounts switched off don't count).` },
              { term: "Fewer leads", body: "Leads dropped by more than 5% compared with the week before." },
              { term: "Missed calls", body: "More than 30% of this week's calls were missed (only checked with at least 5 calls)." },
              {
                term: "Ranking / Spend / Visits",
                body: "This week is clearly different from what's normal for this client. Each client is compared with their own usual numbers, so a naturally bumpy client isn't flagged for a normal week.",
              },
            ]}
          />
          <p>
            <strong>What to expect</strong> estimates next week&apos;s leads and spend once there&apos;s enough history.{" "}
            <strong>Write summary</strong> produces a short AI-written summary that only uses numbers already in the app.
            The same summary goes to Slack and email each morning.
          </p>
        </Section>

        <Section id="clients" title="Managing clients" icon={SettingsIcon} lead="Settings → Clients lists everyone, with every account as a coloured pill.">
          <Sub>Adding a client</Sub>
          <Steps>
            {[
              <>Go to <GoTo href="/settings/clients/new">Settings → Add client</GoTo> and type the client&apos;s name.</>,
              <>We look for matching accounts on every platform and fill them in. Check they&apos;re right, then click <strong>Create client</strong>.</>,
              <>GoHighLevel and OpenPhone need their own key first — see <a href="#keys" className="font-medium text-primary hover:underline">API keys</a>.</>,
            ]}
          </Steps>
          <Sub>Shows on</Sub>
          <p>
            Each client has two switches, in the list and on its page: <strong>Health</strong> (the dashboard, Insights and
            the daily summary) and <strong>SEO</strong> (the SEO page, monthly SEO email and recommendations). Turn off what
            a client isn&apos;t signed up for — numbers keep being collected either way. If some clients only have SEO
            accounts, a banner offers to hide them all from the health dashboard in one click.
          </p>
          <Sub>Pause or archive</Sub>
          <Terms
            rows={[
              { term: "Pause", body: "Stops collecting new numbers and hides the client from the pages. Everything so far is kept. Resume any time." },
              { term: "Archive", body: "For clients you no longer work with: paused and hidden from the list too. Nothing is deleted — use the Archived filter to restore." },
            ]}
          />
          <Sub>Bulk actions</Sub>
          <p>
            Tick clients (or filter, then tick the header box to select everything shown) and a bar appears at the bottom:
            show or hide on Health/SEO, pause, resume, check accounts, set a timezone, export to a spreadsheet, archive or
            restore. Every change is recorded under each client&apos;s <strong>Recent changes</strong>.
          </p>
        </Section>

        <Section id="accounts" title="Connecting accounts" icon={PlugIcon} lead="Each platform shows one coloured pill per client in the list.">
          <Terms
            rows={[
              { term: <Pill className="border border-success/25 bg-success/10 text-success">Google Ads</Pill>, body: "Connected and working." },
              { term: <Pill className="border border-warning/30 bg-warning/10 text-warning">Meta</Pill>, body: "Connected, but no recent activity. Normal for a quiet account — check it's the right one if that's unexpected." },
              {
                term: (
                  <Pill className="border border-destructive/30 bg-destructive/10 font-medium text-destructive">
                    <AlertTriangleIcon className="size-3" />
                    GA4
                  </Pill>
                ),
                body: "Connected, but not working. Hover to see why; the client's page links straight to where access is given.",
              },
              { term: <Pill className="border border-dashed border-primary/40 bg-primary/5 text-primary">Ahrefs</Pill>, body: "Connected, not checked yet. Click Check accounts or Re-check." },
              { term: <Pill className="border border-border text-muted-foreground/60">OpenPhone</Pill>, body: "Used by the client but not connected yet. Click it to connect." },
              { term: <Pill className="border border-border bg-muted text-muted-foreground line-through">Leads</Pill>, body: "Connected but switched off — kept, but left out of updates." },
            ]}
          />
          <p>
            Click a client&apos;s pills or <strong>Accounts</strong> to edit them in a side panel without leaving the list. On
            each account row:
          </p>
          <Terms
            rows={[
              { term: "On / Off", body: "Saves straight away. Off keeps the account but stops collecting it." },
              { term: "Used / Not used", body: "For platforms with nothing connected. Not used hides it from the pills, the counts and the weekly access report." },
              { term: "Re-check", body: "Tests the account now. Saving an account also checks it." },
              { term: "Give access", body: "Opens the platform's own access page, with the email or manager ID to add shown ready to copy." },
            ]}
          />
        </Section>

        <Section id="keys" title="API keys" icon={KeyRoundIcon} lead="GoHighLevel and OpenPhone need a key per client or workspace.">
          <Terms
            rows={[
              { term: "GoHighLevel", body: "One key per client sub-account (Settings → Private Integrations, with View Opportunities ticked), plus the sub-account ID from the address bar." },
              { term: "OpenPhone", body: "One key per workspace (Settings → API). It covers every number in that workspace." },
            ]}
          />
          <p>
            Keys are tested before they&apos;re saved and stored encrypted — they can&apos;t be viewed again, only replaced. The{" "}
            <strong>need a look</strong> filter shows keys not used by any client, or GoHighLevel keys missing a sub-account ID.
          </p>
          <GoTo href="/settings/api-keys">Open API keys</GoTo>
        </Section>

        <Section id="email" title="Email reports" icon={MailIcon} lead="Pick who gets each report in Settings → Email reports.">
          <Terms
            rows={[
              { term: "Daily client summary", body: "Every morning (about 08:30 UTC): who needs a look, what's going well, and anything not updating." },
              { term: "SEO monthly summary", body: "On the 4th of each month: clicks, keywords gained and lost, and clients rising or falling." },
              { term: "Account access report", body: "Every Monday: accounts not working or still needing access. Platforms marked Not used, or that a client is hidden from, aren't listed." },
            ]}
          />
          <p>Each report card shows when it next goes out, and <strong>Send now</strong> sends it straight away to check how it looks.</p>
          <GoTo href="/settings/email-reports">Open email reports</GoTo>
        </Section>

        <Section id="updates" title="How often numbers update" icon={RefreshCwIcon}>
          <p>
            Every morning (08:00 UTC) we collect the previous day&apos;s numbers for every active client and account that&apos;s
            switched on. Ads, analytics and Search Console sometimes take a day or two to finalise their figures, so very
            recent days can still move a little.
          </p>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <span className="flex items-center gap-1.5 font-mono text-destructive">
              <ClockAlertIcon className="size-3.5" /> 40h ago
            </span>
            <span>If a client hasn&apos;t updated for more than {STALE_HOURS} hours, its &ldquo;Updated&rdquo; time turns red. Check its accounts in Settings.</span>
          </div>
          <p>
            After fixing an account, use <strong>Re-check</strong> on it — the red warning clears as soon as the check passes,
            without waiting for tomorrow&apos;s update.
          </p>
        </Section>

        <Section id="platforms" title="Connected platforms" icon={PlugIcon} lead="What each platform gives us, and what to do if an account can't be found.">
          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORM_ORDER.map((platform) => (
              <div key={platform} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 shadow-sm">
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

        <Section id="faq" title="Common questions" icon={LightbulbIcon}>
          <div className="flex flex-col gap-2">
            {[
              {
                q: "Why are so many cells a faint dot?",
                a: "Those accounts aren't connected for that client. SEO-only clients will mostly show dots — hide them from the health dashboard with the Health switch, or connect their other accounts.",
              },
              {
                q: "A client shows a red warning — what do I do?",
                a: "Hover over it for the reason. Most often our Google email or manager account needs adding to the client's account: open the client in Settings and use Give access on that row, then Re-check.",
              },
              {
                q: "Why doesn't the Leads number match GoHighLevel?",
                a: "When a client has the Lead Dashboard connected, Leads come from there. GoHighLevel's count is shown separately in the client's breakdown so you can compare.",
              },
              {
                q: "Will hiding or pausing a client lose data?",
                a: "No. Hiding only changes which pages show the client. Pausing stops new numbers but keeps everything already collected. Archiving does the same and hides it from the list.",
              },
              {
                q: "I changed something by mistake — can I see what?",
                a: "Every change is listed under Recent changes on the client's page, with who made it and when.",
              },
            ].map((item) => (
              <details key={item.q} className="group rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                  {item.q}
                  <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </details>
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
        <nav className="sticky top-8 flex flex-col gap-4 text-sm">
          {groups.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">{group}</span>
              <div className="flex flex-col border-l border-border">
                {TOC.filter((t) => t.group === group).map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="-ml-px border-l border-transparent py-1 pl-3 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </div>
  );
}
