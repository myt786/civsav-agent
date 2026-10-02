"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopyIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { upsertMapping, verifyMapping, type MappingFormState, type VerifyResult } from "@/app/settings/actions";
import type { Platform } from "@/lib/connectors/types";
import { externalIdSchemas } from "@/lib/settings/validation";
import { AccountCombobox, type DiscoveryState } from "@/components/settings/account-combobox";
import { PlatformHelpPopover } from "@/components/settings/platform-help-popover";
import { PLATFORM_ACCESS_LINKS, type PlatformHelp } from "@/lib/connectors/platform-labels";
import type { AccessInfo } from "@/lib/connectors/access-info";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { friendlyError } from "@/lib/friendly-error";
import { formatRelativeTime } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";

export interface MappingRowData {
  externalId: string;
  active: boolean;
  credentialLabel: string | null;
  verifiedAt: Date | null;
  verifiedStatus: "ok" | "no_data" | "error" | null;
  lastError: string | null;
}

const STATUS_STYLE = {
  none: { dot: "bg-muted-foreground/30", text: "text-muted-foreground" },
  unchecked: { dot: "border border-dashed border-muted-foreground bg-transparent", text: "text-muted-foreground" },
  ok: { dot: "bg-success", text: "text-muted-foreground" },
  no_data: { dot: "bg-warning", text: "text-warning" },
  error: { dot: "bg-destructive", text: "font-medium text-destructive" },
} as const;

// One quiet line under the platform name: a coloured dot plus plain words,
// with when it was last checked — instead of a badge and a full timestamp.
function StatusLine({ mapping }: { mapping: MappingRowData | null }) {
  const key = !mapping ? "none" : !mapping.verifiedAt ? "unchecked" : (mapping.verifiedStatus ?? "unchecked");
  const label = {
    none: "Not connected",
    unchecked: "Not checked yet",
    ok: "Working",
    no_data: "No recent activity",
    error: "Not working",
  }[key];
  const style = STATUS_STYLE[key];
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", style.text)}>
      <span className={cn("size-2 shrink-0 rounded-full", style.dot)} aria-hidden />
      {label}
      {mapping?.verifiedAt && (
        <span className="font-normal text-muted-foreground" title={mapping.verifiedAt.toLocaleString()}>
          · {formatRelativeTime(mapping.verifiedAt, new Date())}
        </span>
      )}
    </span>
  );
}

function VerifyOutcome({ result }: { result: VerifyResult }) {
  if (result.status === "error") {
    const { summary, detail } = friendlyError(result.message);
    return (
      <div className="flex flex-col gap-0.5 text-xs">
        <p className="text-destructive">{summary}</p>
        {detail && (
          <details className="text-muted-foreground">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <p className="mt-1 font-mono break-all">{detail}</p>
          </details>
        )}
      </div>
    );
  }
  if (result.status === "no_data") {
    return (
      <p className="text-xs text-warning">
        Connected, but there was no activity in the last 7 days. That&apos;s normal for a quiet account.
      </p>
    );
  }
  return <p className="text-xs text-success">Working — we can see this account&apos;s numbers.</p>;
}

const initialState: MappingFormState = {};

export function toastVerify(title: string, result: VerifyResult) {
  if (result.status === "error") {
    toast({ variant: "error", title: `${title} — not working`, description: friendlyError(result.message).summary });
  } else if (result.status === "no_data") {
    toast({ variant: "default", title: `${title} — connected`, description: "No activity in the last 7 days" });
  } else {
    toast({ variant: "success", title: `${title} — working` });
  }
}

function CopyChip({ value, what }: { value: string; what: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => toast({ variant: "success", title: `${what} copied` }))
          .catch(() => toast({ variant: "error", title: "Couldn't copy — select it and copy by hand." }));
      }}
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-muted"
      title={`Copy ${what.toLowerCase()}`}
    >
      <span className="truncate">{value}</span>
      <CopyIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

// "How do I give you access?" right where the problem shows: a link to the
// exact page on the platform, plus the email or ID to paste there.
function AccessHelp({
  platform,
  label,
  externalId,
  accessInfo,
  addKeyHref,
}: {
  platform: Platform;
  label: string;
  externalId: string | null;
  accessInfo?: AccessInfo;
  addKeyHref?: string;
}) {
  const link = PLATFORM_ACCESS_LINKS[platform];
  const googleEmail =
    (platform === "ga4" || platform === "search_console") && accessInfo?.googleReportingEmail
      ? accessInfo.googleReportingEmail
      : null;
  const managerId = platform === "google_ads" ? (accessInfo?.googleAdsManagerId ?? null) : null;
  if (!link && !addKeyHref) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      {addKeyHref && (
        <Link href={addKeyHref} className="font-medium text-primary underline-offset-2 hover:underline">
          {platform === "ghl" ? "Add this client's GoHighLevel key" : "Add an OpenPhone workspace key"}
        </Link>
      )}
      {link && (
        <a
          href={link.href(externalId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
        >
          {addKeyHref ? link.label : `Give access in ${label}`}
          <ExternalLinkIcon className="size-3" aria-hidden />
        </a>
      )}
      {googleEmail && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          Add as {platform === "ga4" ? "Viewer" : "user"}: <CopyChip value={googleEmail} what="Email" />
        </span>
      )}
      {managerId && (
        <span className="inline-flex items-center gap-1.5">
          Our manager ID: <CopyChip value={managerId} what="Manager ID" />
        </span>
      )}
    </div>
  );
}

export function MappingRow({
  clientId,
  platform,
  label,
  help,
  mapping,
  discovery,
  suggestedId,
  addKeyHref,
  accessInfo,
  onChanged,
}: {
  clientId: string;
  platform: Platform;
  label: string;
  help: PlatformHelp;
  mapping: MappingRowData | null;
  discovery: DiscoveryState;
  suggestedId?: string;
  // GHL/OpenPhone only: where to paste this client's own API key.
  addKeyHref?: string;
  accessInfo?: AccessInfo;
  // Called after a save or a check, for a parent that keeps its own copy
  // of the data (the clients-list side panel).
  onChanged?: () => void;
}) {
  const boundUpsert = upsertMapping.bind(null, clientId, platform);
  const [state, formAction, savePending] = useActionState(boundUpsert, initialState);

  const [externalId, setExternalId] = useState(mapping?.externalId ?? "");
  const [active, setActive] = useState(mapping?.active ?? true);
  const [credentialLabel, setCredentialLabel] = useState<string | null>(mapping?.credentialLabel ?? null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, startVerifying] = useTransition();
  const router = useRouter();

  const liveCheck = externalId.trim().length > 0 ? externalIdSchemas[platform].safeParse(externalId) : null;
  const liveError = liveCheck && !liveCheck.success ? liveCheck.error.issues[0]?.message : null;

  // Saving also checks the account (see upsertMapping), so one click both
  // stores the mapping and tells you whether it works.
  const wasSaving = useRef(savePending);
  useEffect(() => {
    if (wasSaving.current && !savePending && !state.error && state.verify) {
      setVerifyResult(state.verify);
      toastVerify(`${label} saved`, state.verify);
      onChanged?.();
    }
    wasSaving.current = savePending;
  }, [savePending, state.error, state.verify, label]);

  function handleVerify() {
    startVerifying(async () => {
      const result = await verifyMapping(clientId, platform);
      setVerifyResult(result);
      router.refresh();
      toastVerify(label, result);
      onChanged?.();
    });
  }

  // Not connected and nothing picked yet — nothing to save or check.
  const notStarted = !mapping && externalId.trim().length === 0;
  const dirty =
    !mapping ||
    externalId !== mapping.externalId ||
    active !== mapping.active ||
    (credentialLabel ?? null) !== (mapping.credentialLabel ?? null);
  // A saved error shows inline (not just in a tooltip) until a fresh check
  // replaces it, so the reason is readable at a glance.
  const savedError =
    !verifyResult && mapping?.verifiedAt && mapping.verifiedStatus === "error" ? friendlyError(mapping.lastError).summary : null;

  return (
    <form
      action={formAction}
      className={cn(
        "grid gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[11rem_minmax(0,1fr)_10.5rem] md:items-start",
        mapping?.verifiedStatus === "error" && mapping.verifiedAt && "bg-destructive/[0.03]",
      )}
    >
      <div className="flex flex-col gap-0.5 md:pt-1">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <PlatformHelpPopover
            help={help}
            accessLink={
              PLATFORM_ACCESS_LINKS[platform]
                ? {
                    label: PLATFORM_ACCESS_LINKS[platform]!.label,
                    href: PLATFORM_ACCESS_LINKS[platform]!.href(mapping?.externalId ?? null),
                  }
                : undefined
            }
          />
        </div>
        <StatusLine mapping={mapping} />
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <AccountCombobox
          platform={platform}
          name="externalId"
          value={externalId}
          onChange={setExternalId}
          discovery={discovery}
          suggestedId={suggestedId}
          credentialLabel={credentialLabel}
          credentialLabelName="credentialLabel"
          onCredentialLabelChange={setCredentialLabel}
        />
        {savedError && <p className="text-xs text-destructive">{savedError}</p>}
        {liveError && <p className="text-xs text-destructive">{liveError}</p>}
        {state.error && <p className="text-xs text-destructive">{state.error}</p>}
        {verifyResult && <VerifyOutcome result={verifyResult} />}
        {/* Only worth the space while there's something to fix: not
            connected, not working, or connected but silent. */}
        {(!mapping || mapping.verifiedStatus === "error" || mapping.verifiedStatus === "no_data") && (
          <AccessHelp
            platform={platform}
            label={label}
            externalId={mapping?.externalId ?? null}
            accessInfo={accessInfo}
            addKeyHref={addKeyHref}
          />
        )}
      </div>

      {/* Fixed-width action column so the account pickers line up row to
          row. A platform with nothing picked yet shows no controls at all —
          a switch and a greyed-out button there only read as broken. */}
      <div className="flex items-center gap-2 md:h-8 md:justify-end md:self-start md:pt-0.5">
        {notStarted ? (
          <input type="hidden" name="active" value="true" />
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center">
                  <Switch
                    name="active"
                    value="true"
                    checked={active}
                    onCheckedChange={setActive}
                    size="sm"
                    aria-label={`Include ${label} in daily updates`}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>{active ? "Included in daily updates" : "Left out of daily updates"}</TooltipContent>
            </Tooltip>
            {dirty ? (
              <Button type="submit" size="sm" disabled={savePending || externalId.trim().length === 0}>
                {savePending ? "Saving…" : mapping ? "Save" : "Connect"}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="ghost" disabled={verifying} onClick={handleVerify}>
                <RefreshCwIcon className={cn("size-3.5", verifying && "animate-spin")} />
                {verifying ? "Checking…" : "Re-check"}
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
