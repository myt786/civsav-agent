"use client";

import { useActionState, useState, useTransition } from "react";
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
        not verified
      </Badge>
    );
  }
  if (mapping.verifiedStatus === "ok") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-600/30 text-emerald-700 dark:text-emerald-500">
        <CheckCircle2Icon className="size-3" />
        verified
      </Badge>
    );
  }
  if (mapping.verifiedStatus === "no_data") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-600/30 text-amber-700 dark:text-amber-500">
        <MinusCircleIcon className="size-3" />
        no data
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive" tabIndex={0}>
          <AlertTriangleIcon className="size-3" />
          error
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{mapping.lastError}</TooltipContent>
    </Tooltip>
  );
}

function VerifyOutcome({ result }: { result: VerifyResult }) {
  if (result.status === "error") {
    return <p className="text-xs text-destructive">{result.message}</p>;
  }
  if (result.status === "no_data") {
    return <p className="text-xs text-amber-700 dark:text-amber-500">Connected, but returned nothing for this period.</p>;
  }
  const entries = Object.entries(result.figures);
  if (entries.length === 0) {
    return <p className="text-xs text-emerald-700 dark:text-emerald-500">Connected — no scalar figures to show.</p>;
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <span key={key} className="font-mono tabular-nums text-foreground">
          <span className="text-muted-foreground">{key}:</span> {value}
        </span>
      ))}
    </div>
  );
}

const initialState: MappingFormState = {};

export function MappingRow({
  clientId,
  platform,
  label,
  help,
  mapping,
  discovery,
  suggestedId,
}: {
  clientId: string;
  platform: Platform;
  label: string;
  help: PlatformHelp;
  mapping: MappingRowData | null;
  discovery: DiscoveryState;
  suggestedId?: string;
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

  function handleVerify() {
    startVerifying(async () => {
      const result = await verifyMapping(clientId, platform);
      setVerifyResult(result);
      router.refresh();
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
          {liveError && <p className="text-xs text-destructive">{liveError}</p>}
          {state.error && <p className="text-xs text-destructive">{state.error}</p>}
        </div>

        <div className="flex items-center gap-1.5 pt-1.5">
          <Switch name="active" value="true" checked={active} onCheckedChange={setActive} size="sm" />
          <span className="text-xs text-muted-foreground">active</span>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <Button type="submit" size="sm" variant="secondary" disabled={savePending || externalId.trim().length === 0}>
            {savePending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={verifying || !mapping}
            onClick={handleVerify}
          >
            {verifying ? "Verifying…" : "Verify"}
          </Button>
        </div>
      </form>

      {verifyResult && <VerifyOutcome result={verifyResult} />}
    </div>
  );
}
