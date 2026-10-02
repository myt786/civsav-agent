"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  EyeIcon,
  GlobeIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { bulkUpdateClients, verifyAllMappings, type BulkClientAction } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { PLATFORM_LABELS } from "@/lib/connectors/platform-labels";
import type { Platform } from "@/lib/connectors/types";

export interface BulkClient {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  archived: boolean;
  showOnDashboard: boolean;
  showOnSeo: boolean;
  accounts: { platform: Platform; active: boolean; verifiedAt: Date | null; verifiedStatus: string | null }[];
  lastUpdatedAt: Date | null;
}

const TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
const CHECK_CONCURRENCY = 3;

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function accountWord(a: BulkClient["accounts"][number]): string {
  if (!a.active) return "off";
  if (!a.verifiedAt) return "not checked";
  if (a.verifiedStatus === "error") return "not working";
  if (a.verifiedStatus === "no_data") return "no recent data";
  return "working";
}

// A spreadsheet of the selected clients — status, where they show and each
// account's state — for sharing or working through offline.
function downloadCsv(rows: BulkClient[]) {
  const header = ["Client", "Status", "Timezone", "Health dashboard", "SEO", "Accounts", "Last updated"];
  const lines = rows.map((c) =>
    [
      c.name,
      c.archived ? "Archived" : c.active ? "Active" : "Paused",
      c.timezone,
      c.showOnDashboard ? "Yes" : "No",
      c.showOnSeo ? "Yes" : "No",
      c.accounts.map((a) => `${PLATFORM_LABELS[a.platform]}: ${accountWord(a)}`).join("; "),
      c.lastUpdatedAt ? c.lastUpdatedAt.toISOString().slice(0, 16).replace("T", " ") : "Never",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ClientsBulkBar({
  selected,
  totalShown,
  onSelectAllShown,
  onClear,
}: {
  selected: BulkClient[];
  totalShown: number;
  onSelectAllShown: () => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null);
  const [timezone, setTimezone] = useState("");
  const count = selected.length;
  const ids = selected.map((c) => c.id);
  const anyArchived = selected.some((c) => c.archived);
  const anyLive = selected.some((c) => !c.archived);

  function run(action: BulkClientAction, describe: (n: number) => string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      const result = await bulkUpdateClients(ids, action);
      if (result.error) {
        toast({ variant: "error", title: "Nothing changed", description: result.error });
        return;
      }
      toast(
        result.changed > 0
          ? { variant: "success", title: describe(result.changed) }
          : { variant: "default", title: "Nothing to change", description: "The selected clients were already set that way." },
      );
      router.refresh();
    });
  }

  async function checkAccounts() {
    const targets = selected.filter((c) => !c.archived && c.accounts.length > 0);
    if (targets.length === 0) {
      toast({ variant: "default", title: "No accounts to check", description: "None of the selected clients have accounts connected." });
      return;
    }
    setChecking({ done: 0, total: targets.length });
    let cursor = 0;
    let failedClients = 0;
    async function worker() {
      while (cursor < targets.length) {
        const client = targets[cursor++];
        try {
          const results = await verifyAllMappings(client.id);
          if (results.some((r) => r.result.status === "error")) failedClients++;
        } catch {
          failedClients++;
        } finally {
          setChecking((c) => (c ? { ...c, done: c.done + 1 } : c));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, targets.length) }, () => worker()));
    setChecking(null);
    router.refresh();
    toast(
      failedClients === 0
        ? { variant: "success", title: `Checked ${targets.length} ${targets.length === 1 ? "client" : "clients"} — all working` }
        : {
            variant: "error",
            title: `${failedClients} of ${targets.length} have an account not working`,
            description: "They're marked red in the list.",
          },
    );
  }

  if (count === 0) return null;
  const busy = pending || checking !== null;
  const plural = (n: number) => `${n} ${n === 1 ? "client" : "clients"}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-2 shadow-lg">
        <span className="px-2 text-sm font-medium text-foreground tabular-nums">{count} selected</span>
        {count < totalShown && (
          <Button type="button" size="sm" variant="ghost" onClick={onSelectAllShown} disabled={busy}>
            Select all {totalShown}
          </Button>
        )}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy || !anyLive}>
              <EyeIcon className="size-3.5" />
              Shows on
              <ChevronDownIcon className="size-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-56 p-1">
            {(
              [
                { action: { kind: "showOnDashboard", value: true }, label: "Show on Health dashboard", done: "now on the health dashboard" },
                { action: { kind: "showOnDashboard", value: false }, label: "Hide from Health dashboard", done: "hidden from the health dashboard" },
                { action: { kind: "showOnSeo", value: true }, label: "Show on SEO", done: "now on SEO" },
                { action: { kind: "showOnSeo", value: false }, label: "Hide from SEO", done: "hidden from SEO" },
              ] as const
            ).map((item) => (
              <button
                key={item.label}
                type="button"
                className="flex w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => run(item.action, (n) => `${plural(n)} ${item.done}`)}
              >
                {item.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !anyLive}
          onClick={() =>
            run({ kind: "pause" }, (n) => `${plural(n)} paused`, `Pause ${plural(count)}? New numbers stop being collected; everything so far is kept.`)
          }
        >
          <PauseIcon className="size-3.5" />
          Pause
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !anyLive} onClick={() => run({ kind: "resume" }, (n) => `${plural(n)} resumed`)}>
          <PlayIcon className="size-3.5" />
          Resume
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !anyLive} onClick={checkAccounts}>
          <CheckCheckIcon className="size-3.5" />
          {checking ? `Checking ${checking.done}/${checking.total}…` : "Check accounts"}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={busy}>
              <GlobeIcon className="size-3.5" />
              Timezone
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="flex w-72 flex-col gap-2 p-3">
            <span className="text-xs text-muted-foreground">Set the timezone for {plural(count)}.</span>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a timezone" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={!timezone || busy}
              onClick={() => run({ kind: "timezone", value: timezone }, (n) => `Timezone set to ${timezone} for ${plural(n)}`)}
            >
              Apply
            </Button>
          </PopoverContent>
        </Popover>

        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => downloadCsv(selected)}>
          <DownloadIcon className="size-3.5" />
          Export
        </Button>

        {anyLive && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() =>
              run(
                { kind: "archive" },
                (n) => `${plural(n)} archived`,
                `Archive ${plural(count)}? They're hidden and paused, but nothing is deleted — restore them any time.`,
              )
            }
          >
            <ArchiveIcon className="size-3.5" />
            Archive
          </Button>
        )}
        {anyArchived && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ kind: "restore" }, (n) => `${plural(n)} restored`)}>
            <ArchiveRestoreIcon className="size-3.5" />
            Restore
          </Button>
        )}

        <Button type="button" size="icon-sm" variant="ghost" onClick={onClear} disabled={busy} aria-label="Clear selection" title="Clear selection">
          <XIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
