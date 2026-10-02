"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailIcon, SendIcon, Trash2Icon } from "lucide-react";
import {
  addReportRecipient,
  removeReportRecipient,
  sendReportNow,
  updateReportRecipient,
  type RecipientFormState,
} from "@/app/settings/email-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";

export interface RecipientRow {
  id: string;
  email: string;
  dailySummary: boolean;
  monthlySeo: boolean;
}

const REPORTS = [
  { key: "dailySummary", label: "Daily summary", hint: "Every morning" },
  { key: "monthlySeo", label: "SEO monthly", hint: "On the 4th" },
] as const;

const initialState: RecipientFormState = {};

function AddRecipientForm() {
  const [state, formAction, pending] = useActionState(addReportRecipient, initialState);
  const [email, setEmail] = useState("");
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
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-medium text-foreground">Add someone</h3>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recipient-email">Email address</Label>
        <Input
          id="recipient-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Send them</legend>
        {REPORTS.map((report) => (
          <label key={report.key} className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name={report.key} defaultChecked className="size-4 accent-primary" />
            {report.label}
            <span className="text-xs text-muted-foreground">· {report.hint}</span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

function RecipientItem({ row }: { row: RecipientRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(field: "dailySummary" | "monthlySeo", value: boolean) {
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

  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <MailIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{row.email}</span>
      </span>
      <div className="flex flex-wrap items-center gap-4">
        {REPORTS.map((report) => (
          <label key={report.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              size="sm"
              checked={row[report.key]}
              disabled={pending}
              onCheckedChange={(value) => toggle(report.key, value)}
              aria-label={`${report.label} for ${row.email}`}
            />
            {report.label}
          </label>
        ))}
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={remove} aria-label={`Remove ${row.email}`}>
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function SendNowButton({ kind, label, disabled }: { kind: "daily" | "monthlySeo"; label: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await sendReportNow(kind);
          toast(
            result.sent
              ? { variant: "success", title: result.message }
              : { variant: "error", title: "Not sent", description: result.message },
          );
        })
      }
    >
      <SendIcon className="size-3.5" />
      {pending ? "Sending…" : label}
    </Button>
  );
}

export function EmailReportsManager({ recipients, configured }: { recipients: RecipientRow[]; configured: boolean }) {
  const dailyCount = recipients.filter((r) => r.dailySummary).length;
  const seoCount = recipients.filter((r) => r.monthlySeo).length;

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <AddRecipientForm />

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">Who gets them</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {recipients.length} {recipients.length === 1 ? "person" : "people"}
          </span>
        </div>

        {recipients.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            <MailIcon className="size-4 shrink-0" aria-hidden />
            No one yet — add an email on the left.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border">
            {recipients.map((row) => (
              <RecipientItem key={row.id} row={row} />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Send a report now to everyone ticked for it — handy to check it looks right.
          </p>
          <div className="flex flex-wrap gap-2">
            <SendNowButton kind="daily" label={`Send daily summary (${dailyCount})`} disabled={!configured || dailyCount === 0} />
            <SendNowButton kind="monthlySeo" label={`Send SEO summary (${seoCount})`} disabled={!configured || seoCount === 0} />
          </div>
        </div>
      </div>
    </div>
  );
}
