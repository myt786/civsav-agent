"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, CheckIcon, ClipboardListIcon, MailIcon, PlusIcon, SendIcon, SunriseIcon, Trash2Icon, TrendingUpIcon } from "lucide-react";
import {
  addReportRecipient,
  removeReportRecipient,
  sendReportNow,
  updateReportRecipient,
  type RecipientFormState,
} from "@/app/settings/email-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

export interface RecipientRow {
  id: string;
  email: string;
  dailySummary: boolean;
  monthlySeo: boolean;
  accessReport: boolean;
}

type ReportField = "dailySummary" | "monthlySeo" | "accessReport";

export interface ReportSchedule {
  // Already formatted on the server ("Tomorrow, 08:30 UTC"), so the page
  // renders the same text on the server and in the browser.
  nextSend: string;
}

const REPORTS: {
  key: ReportField;
  kind: "daily" | "monthlySeo" | "access";
  label: string;
  short: string;
  schedule: string;
  description: string;
  icon: typeof SunriseIcon;
  accent: string;
  defaultOn: boolean;
}[] = [
  {
    key: "dailySummary",
    kind: "daily",
    label: "Daily client summary",
    short: "Daily",
    schedule: "Every morning",
    description: "What changed yesterday, who needs a look and what's going well.",
    icon: SunriseIcon,
    accent: "bg-primary/10 text-primary",
    defaultOn: true,
  },
  {
    key: "monthlySeo",
    kind: "monthlySeo",
    label: "SEO monthly summary",
    short: "SEO",
    schedule: "4th of each month",
    description: "Google clicks, keywords gained and lost, and clients rising or falling.",
    icon: TrendingUpIcon,
    accent: "bg-success/10 text-success",
    defaultOn: true,
  },
  {
    key: "accessReport",
    kind: "access",
    label: "Account access report",
    short: "Access",
    schedule: "Every Monday",
    description: "Clients whose accounts aren't working or still need access given.",
    icon: ClipboardListIcon,
    accent: "bg-warning/10 text-warning",
    defaultOn: false,
  },
];

const initialState: RecipientFormState = {};

function initials(email: string) {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

function ReportCard({
  report,
  count,
  nextSend,
  configured,
}: {
  report: (typeof REPORTS)[number];
  count: number;
  nextSend: string;
  configured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const Icon = report.icon;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", report.accent)}>
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">{report.label}</span>
          <span className="text-xs text-muted-foreground">{report.schedule}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{report.description}</p>
      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClockIcon className="size-3.5" />
            Next: <span className="font-medium text-foreground">{nextSend}</span>
          </span>
          <span className={cn("tabular-nums", count === 0 ? "text-warning" : "text-muted-foreground")}>
            {count === 0 ? "No one gets it" : `${count} ${count === 1 ? "person" : "people"}`}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!configured || count === 0 || pending}
          title={!configured ? "Switches on once email sending is set up" : count === 0 ? "Add someone to this report first" : undefined}
          onClick={() =>
            startTransition(async () => {
              const result = await sendReportNow(report.kind);
              toast(
                result.sent
                  ? { variant: "success", title: result.message }
                  : { variant: "error", title: "Not sent", description: result.message },
              );
            })
          }
        >
          <SendIcon className="size-3.5" />
          {pending ? "Sending…" : "Send now"}
        </Button>
      </div>
    </div>
  );
}

function AddRecipientRow() {
  const [state, formAction, pending] = useActionState(addReportRecipient, initialState);
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<Record<ReportField, boolean>>({
    dailySummary: true,
    monthlySeo: true,
    accessReport: false,
  });
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.error) toast({ variant: "error", title: "Not added", description: state.error });
      else if (state.success) {
        toast({ variant: "success", title: state.success });
        setEmail("");
      }
    }
    wasPending.current = pending;
  }, [pending, state.error, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-3 border-b border-border bg-muted/30 p-4 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <MailIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Add someone — name@company.com"
          className="h-9 bg-card pl-8"
          aria-label="Email address"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Reports to send">
        {REPORTS.map((report) => {
          const on = picked[report.key];
          return (
            <button
              key={report.key}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked((p) => ({ ...p, [report.key]: !p[report.key] }))}
              className={cn(
                "flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
                on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {on ? <CheckIcon className="size-3" /> : <PlusIcon className="size-3" />}
              {report.short}
            </button>
          );
        })}
        {REPORTS.map((report) =>
          picked[report.key] ? <input key={report.key} type="hidden" name={report.key} value="on" /> : null,
        )}
      </div>
      <Button type="submit" size="sm" className="h-9" disabled={pending || email.trim() === ""}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

function RecipientItem({ row }: { row: RecipientRow }) {
  const router = useRouter();
  const [values, setValues] = useState(row);
  const [pending, startTransition] = useTransition();
  useEffect(() => setValues(row), [row]);

  function toggle(field: ReportField, value: boolean) {
    setValues((v) => ({ ...v, [field]: value }));
    startTransition(async () => {
      await updateReportRecipient(row.id, field, value);
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`Stop sending reports to ${row.email}?`)) return;
    startTransition(async () => {
      await removeReportRecipient(row.id);
      toast({ variant: "success", title: `${row.email} removed` });
      router.refresh();
    });
  }

  const none = !values.dailySummary && !values.monthlySeo && !values.accessReport;

  return (
    <tr className={cn("border-b border-border transition-colors last:border-b-0 hover:bg-muted/30", pending && "opacity-70")}>
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials(row.email)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-foreground" title={row.email}>
              {row.email}
            </span>
            {none && <span className="text-xs text-warning">Gets nothing right now</span>}
          </div>
        </div>
      </td>
      {REPORTS.map((report) => (
        <td key={report.key} className="px-3 py-3 text-center">
          <Switch
            size="sm"
            checked={values[report.key]}
            disabled={pending}
            onCheckedChange={(value) => toggle(report.key, value)}
            aria-label={`${report.label} for ${row.email}`}
          />
        </td>
      ))}
      <td className="px-3 py-3 text-right">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={pending}
          onClick={remove}
          aria-label={`Remove ${row.email}`}
          title="Remove"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </td>
    </tr>
  );
}

export function EmailReportsManager({
  recipients,
  configured,
  schedules,
}: {
  recipients: RecipientRow[];
  configured: boolean;
  schedules: Record<ReportField, ReportSchedule>;
}) {
  const counts: Record<ReportField, number> = {
    dailySummary: recipients.filter((r) => r.dailySummary).length,
    monthlySeo: recipients.filter((r) => r.monthlySeo).length,
    accessReport: recipients.filter((r) => r.accessReport).length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 md:grid-cols-3">
        {REPORTS.map((report) => (
          <ReportCard
            key={report.key}
            report={report}
            count={counts[report.key]}
            nextSend={schedules[report.key].nextSend}
            configured={configured}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">Who gets them</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {recipients.length} {recipients.length === 1 ? "person" : "people"}
          </span>
        </div>
        <AddRecipientRow />
        {recipients.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MailIcon className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">No one gets the reports yet</p>
            <p className="text-xs text-muted-foreground">Add an email above and pick which reports they should get.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2 text-left font-medium">Person</th>
                  {REPORTS.map((report) => (
                    <th key={report.key} className="w-28 px-3 py-2 text-center font-medium">
                      {report.short}
                    </th>
                  ))}
                  <th className="w-12 px-3 py-2" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {recipients.map((row) => (
                  <RecipientItem key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
