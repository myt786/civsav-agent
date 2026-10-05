"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, MegaphoneIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { deletePlatformCredential, type CredentialFormState } from "@/app/settings/credentials-actions";
import { ConfirmSubmitButton } from "@/components/settings/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";

export interface GoogleAdsLoginRow {
  // null for the main login set up in Vercel.
  id: string | null;
  name: string;
  managerId: string | null;
  usedBy: number;
  createdBy: string | null;
  updatedAt: string | null;
}

export interface GoogleAdsConnectResult {
  status: "connected" | "reconnected" | "error";
  name?: string;
  accounts?: string;
  message?: string;
}

const initialState: CredentialFormState = {};

function connectHref(name: string, managerId: string | null) {
  const params = new URLSearchParams({ name });
  if (managerId) params.set("managerId", managerId);
  return `/api/google-ads/connect?${params.toString()}`;
}

function LoginRow({ login }: { login: GoogleAdsLoginRow }) {
  const [state, action, pending] = useActionState(
    deletePlatformCredential.bind(null, login.id ?? ""),
    initialState,
  );
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending && state.error) {
      toast({ variant: "error", title: "Login not removed", description: state.error });
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  const isMain = login.id === null;
  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
          isMain ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {login.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
          <span className="truncate">{login.name}</span>
          {isMain && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
              Set up in Vercel
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {login.managerId ? `Manager ${login.managerId}` : "Direct account access"}
          {" · "}
          {login.usedBy === 0 ? "Not used by any client yet" : `Used by ${login.usedBy} client${login.usedBy === 1 ? "" : "s"}`}
          {login.updatedAt && ` · connected ${formatRelativeTime(new Date(login.updatedAt), new Date())}`}
          {login.createdBy && ` by ${login.createdBy}`}
        </span>
      </div>
      {!isMain && (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="outline" asChild title="Sign in again, e.g. after a password change">
            <a href={connectHref(login.name, login.managerId)}>
              <RefreshCwIcon className="size-3.5" />
              Reconnect
            </a>
          </Button>
          <form action={action}>
            <ConfirmSubmitButton
              type="submit"
              size="icon-sm"
              variant="ghost"
              disabled={pending}
              aria-label={`Remove ${login.name}`}
              title="Remove login"
              className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              confirmMessage={`Remove the Google Ads login "${login.name}"? Clients still using it have to be moved first.`}
            >
              <Trash2Icon className="size-3.5" />
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </li>
  );
}

function CopyRedirect({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 py-1 pr-1 pl-2">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{value}</code>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="size-7"
        aria-label="Copy redirect URI"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
      </Button>
    </span>
  );
}

// Settings → API keys: the Google users Google Ads is read as. Each team
// member whose ad accounts sit under a different manager account connects
// their own; the account picker on a client's page then lists every
// login's accounts and remembers which one each client uses.
export function GoogleAdsLogins({
  logins,
  redirectUri,
  configured,
  result,
}: {
  logins: GoogleAdsLoginRow[];
  redirectUri: string;
  configured: boolean;
  result: GoogleAdsConnectResult | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(logins.length === 0);

  // The connect flow lands back here with its outcome in the URL: show it
  // once, then drop it so a refresh doesn't repeat it.
  const shown = useRef(false);
  useEffect(() => {
    if (!result || shown.current) return;
    shown.current = true;
    if (result.status === "error") {
      toast({ variant: "error", title: "Google Ads not connected", description: result.message });
    } else {
      const count = Number(result.accounts ?? 0);
      toast({
        variant: "success",
        title: `${result.name} ${result.status === "reconnected" ? "reconnected" : "connected"}`,
        description: `${count} ad account${count === 1 ? "" : "s"} found. Pick them on each client's page.`,
      });
    }
    router.replace("/settings/api-keys", { scroll: false });
  }, [result, router]);

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MegaphoneIcon className="size-4" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h3 className="font-heading text-sm font-semibold text-foreground">Google Ads logins</h3>
            <p className="max-w-2xl text-xs text-muted-foreground">
              Each login reads the ad accounts its Google user can see. Connect one for every team member whose
              accounts sit under a different manager account. On a client&apos;s page, the account list then shows
              every login&apos;s accounts.
            </p>
          </div>
        </div>
        {!adding && configured && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <PlusIcon className="size-3.5" />
            Connect Google Ads
          </Button>
        )}
      </div>

      {logins.length > 0 && <ul className="flex flex-col">{logins.map((login) => <LoginRow key={login.id ?? "main"} login={login} />)}</ul>}

      {!configured && (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Google Ads isn&apos;t set up in this app yet. GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET need to be set in Vercel first.
        </p>
      )}

      {adding && configured && (
        <form
          method="get"
          action="/api/google-ads/connect"
          className="flex flex-col gap-4 border-t border-border bg-muted/30 px-4 py-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gads-name">Name</Label>
              <Input id="gads-name" name="name" placeholder="e.g. Ali's accounts" maxLength={200} />
              <span className="text-xs text-muted-foreground">Leave blank to use their Google email.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gads-manager">Manager account ID (optional)</Label>
              <Input id="gads-manager" name="managerId" placeholder="123-456-7890" inputMode="numeric" />
              <span className="text-xs text-muted-foreground">
                Found automatically if they only have one manager account.
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">Continue with Google</Button>
            {logins.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              The team member signs in with the Google account that has access to their ad accounts.
            </span>
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">First time? One-off Google Cloud setup</summary>
            <div className="mt-2 flex flex-col gap-2">
              <p>
                In Google Cloud → APIs &amp; Services → Credentials, open the OAuth client used for Google Ads and add
                this as an authorised redirect URI:
              </p>
              <CopyRedirect value={redirectUri} />
              <p>
                Also set the OAuth consent screen to <strong>In production</strong>. In testing mode, Google
                expires these logins after 7 days.
              </p>
            </div>
          </details>
        </form>
      )}
    </section>
  );
}
