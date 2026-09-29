"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, MinusCircleIcon } from "lucide-react";
import { upsertMapping, verifyMapping, type MappingFormState, type VerifyResult } from "@/app/settings/actions";
import type { Platform } from "@/lib/connectors/types";
import { externalIdSchemas } from "@/lib/settings/validation";
import { AccountCombobox, type DiscoveryState } from "@/components/settings/account-combobox";
import { PlatformHelpPopover } from "@/components/settings/platform-help-popover";
import type { PlatformHelp } from "@/lib/connectors/platform-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";
import { friendlyError } from "@/lib/friendly-error";

export interface MappingRowData {
  externalId: string;
  active: boolean;
  credentialLabel: string | null;
  verifiedAt: Date | null;
  verifiedStatus: "ok" | "no_data" | "error" | null;
  lastError: string | null;
}

function StatusBadge({ mapping }: { mapping: MappingRowData | null }) {
  if (!mapping || !mapping.verifiedAt) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <CircleIcon className="size-3" />
        {mapping ? "not checked yet" : "not connected"}
      </Badge>
    );
  }
  if (mapping.verifiedStatus === "ok") {
    return (
      <Badge variant="outline" className="gap-1 border-success/30 text-success">
        <CheckCircle2Icon className="size-3" />
        working
      </Badge>
    );
  }
  if (mapping.verifiedStatus === "no_data") {
    return (
      <Badge variant="outline" className="gap-1 border-warning/30 text-warning">
        <MinusCircleIcon className="size-3" />
        connected, no activity
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive" tabIndex={0}>
          <AlertTriangleIcon className="size-3" />
          not working
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{friendlyError(mapping.lastError).summary}</TooltipContent>
    </Tooltip>
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

export function MappingRow({
  clientId,
  platform,
  label,
  help,
  mapping,
  discovery,
  suggestedId,
  addKeyHref,
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
    }
    wasSaving.current = savePending;
  }, [savePending, state.error, state.verify, label]);

  function handleVerify() {
    startVerifying(async () => {
      const result = await verifyMapping(clientId, platform);
      setVerifyResult(result);
      router.refresh();
      toastVerify(label, result);
    });
  }

  return (
    <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-32 shrink-0 text-sm font-medium text-foreground">{label}</span>
          <PlatformHelpPopover help={help} />
          <StatusBadge mapping={mapping} />
        </div>
        {mapping?.verifiedAt && (
          <span className="text-xs text-muted-foreground">Last checked {mapping.verifiedAt.toLocaleString()}</span>
        )}
      </div>

      <form action={formAction} className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
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
          {addKeyHref && (
            <Link
              href={addKeyHref}
              className="self-start text-xs text-primary underline-offset-2 hover:underline"
            >
              {platform === "ghl" ? "Add this client's GoHighLevel key" : "Add an OpenPhone workspace key"}
            </Link>
          )}
          {liveError && <p className="text-xs text-destructive">{liveError}</p>}
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}
        </div>

        <div className="flex items-center gap-1.5 pt-1.5">
          <Switch name="active" value="true" checked={active} onCheckedChange={setActive} size="sm" />
          <span className="text-xs text-muted-foreground">include in updates</span>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <Button type="submit" size="sm" variant="secondary" disabled={savePending || externalId.trim().length === 0}>
            {savePending ? "Saving and checking…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={verifying || !mapping}
            onClick={handleVerify}
          >
            {verifying ? "Checking…" : "Re-check"}
          </Button>
        </div>
      </form>

      {verifyResult && <VerifyOutcome result={verifyResult} />}
    </div>
  );
}
