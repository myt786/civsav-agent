"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, ShieldCheckIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { addTeamMember, removeTeamMember, resetTeamMemberPassword, type TeamActionResult } from "@/app/settings/team-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { formatRelativeTime } from "@/lib/dashboard/format";

export interface TeamMemberRow {
  id: string;
  email: string;
  createdBy: string;
  createdAt: string;
  passwordSetAt: string;
  lastLoginAt: string | null;
  isYou: boolean;
}

function initials(email: string) {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

// The one time a password is visible: after adding someone or resetting it.
function NewPassword({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Dashboard: https://civsav-agent.vercel.app\nEmail: ${email}\nPassword: ${password}`;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <ShieldCheckIcon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">Password for {email}</span>
          <span className="text-xs text-muted-foreground">
            Copy it now and send it to them privately. It can&apos;t be shown again, only reset.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg border border-border bg-card px-3 py-2 font-mono text-base tracking-wide text-foreground select-all">
          {password}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy sign-in details"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function TeamManager({ members }: { members: TeamMemberRow[] }) {
  const [email, setEmail] = useState("");
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function handle(result: TeamActionResult, failTitle: string) {
    if (result.error) {
      toast({ variant: "error", title: failTitle, description: result.error });
      return false;
    }
    if (result.email && result.password) setShown({ email: result.email, password: result.password });
    return true;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="flex flex-col gap-4 lg:sticky lg:top-6">
        <form
          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (handle(await addTeamMember(email), "Not added")) setEmail("");
            });
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserPlusIcon className="size-4" />
            </span>
            <div className="flex flex-col">
              <h3 className="font-heading text-sm font-semibold text-foreground">Add a person</h3>
              <span className="text-xs text-muted-foreground">A password is generated for them.</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-email">Work email</Label>
            <Input
              id="team-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@civsav.com"
              required
            />
          </div>
          <Button type="submit" disabled={pending || email.trim() === ""}>
            {pending ? "Adding…" : "Add and create password"}
          </Button>
        </form>
        {shown && <NewPassword email={shown.email} password={shown.password} onDone={() => setShown(null)} />}
      </div>

      <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <h3 className="font-heading text-sm font-semibold text-foreground">People</h3>
          <span className="text-xs text-muted-foreground">{members.length} with their own password</span>
        </div>
        {members.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No one yet. Until you add people, sign-in uses the shared password.
          </p>
        ) : (
          <ul className="flex flex-col">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(member.email)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                    <span className="truncate">{member.email}</span>
                    {member.isYou && (
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">You</span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {member.lastLoginAt
                      ? `Last signed in ${formatRelativeTime(new Date(member.lastLoginAt), new Date())}`
                      : "Hasn't signed in yet"}
                    {` · added by ${member.createdBy}`}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === member.id}
                    onClick={() => {
                      if (!window.confirm(`Give ${member.email} a new password? Their old one stops working and they're signed out.`)) return;
                      setBusyId(member.id);
                      startTransition(async () => {
                        handle(await resetTeamMemberPassword(member.id), "Password not reset");
                        setBusyId(null);
                      });
                    }}
                  >
                    <KeyRoundIcon className="size-3.5" />
                    Reset password
                  </Button>
                  {!member.isYou && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${member.email}`}
                      title="Remove"
                      disabled={busyId === member.id}
                      className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        if (!window.confirm(`Remove ${member.email}? They're signed out and can't sign in with their password again.`)) return;
                        setBusyId(member.id);
                        startTransition(async () => {
                          if (handle(await removeTeamMember(member.id), "Not removed")) {
                            toast({ variant: "success", title: `${member.email} removed` });
                          }
                          setBusyId(null);
                        });
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
