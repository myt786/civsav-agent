"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox, type DiscoveryState } from "@/components/settings/account-combobox";
import { PlatformHelpPopover } from "@/components/settings/platform-help-popover";
import { RefreshDiscoveryButton } from "@/components/settings/refresh-discovery-button";
import { createClientWithMappings, discoverAllAccounts } from "@/app/settings/actions";
import { PLATFORM_HELP, PLATFORM_LABELS, PLATFORM_ORDER } from "@/lib/connectors/platform-labels";
import { bestMatch } from "@/lib/settings/fuzzy-match";
import type { Platform } from "@/lib/connectors/types";

const TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

interface RowState {
  externalId: string;
  // Only meaningful for a platform whose accounts are split across
  // several per-tenant credentials (OpenPhone) — see PlatformAccount.
  // credentialLabel. Null for every other platform.
  credentialLabel: string | null;
  // Whether the current externalId was set by the suggestion engine rather
  // than a deliberate user pick — only auto-filled rows get overwritten as
  // the client name keeps changing; anything the user has touched is left
  // alone even if a better-scoring suggestion shows up later.
  autoFilled: boolean;
  // Opened by hand from the "Add" list, so it stays visible while empty.
  open: boolean;
  // Removed by hand — the suggestion engine never refills it.
  dismissed: boolean;
}

function emptyRow(): RowState {
  return { externalId: "", credentialLabel: null, autoFilled: false, open: false, dismissed: false };
}

function isShown(row: RowState): boolean {
  return row.externalId !== "" || row.open;
}

export function ClientSetupForm({ defaultTimezone }: { defaultTimezone: string }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [editingTimezone, setEditingTimezone] = useState(false);

  // Suggest the browser's own timezone once the client mounts, rather
  // than always defaulting to DEFAULT_CLIENT_TIMEZONE — most new clients
  // are being added by someone in roughly the client's own region. Runs
  // once, before anyone's had a chance to pick something themselves, so
  // overwriting the initial (server-rendered) default here is safe.
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch {
      // Unsupported environment — keep the server-provided default.
    }
  }, []);
  const [discovery, setDiscovery] = useState<Record<Platform, DiscoveryState>>(() =>
    Object.fromEntries(PLATFORM_ORDER.map((p) => [p, { status: "loading" }])) as Record<Platform, DiscoveryState>,
  );
  const [rows, setRows] = useState<Record<Platform, RowState>>(() =>
    Object.fromEntries(PLATFORM_ORDER.map((p) => [p, emptyRow()])) as Record<Platform, RowState>,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  async function loadDiscovery(forceRefresh: boolean) {
    const results = await discoverAllAccounts(forceRefresh);
    setDiscovery((prev) => {
      const next = { ...prev };
      for (const { platform, result } of results) {
        next[platform] =
          result.status === "ok"
            ? { status: "ok", accounts: result.accounts }
            : { status: "error", error: result.error, accounts: [] };
      }
      return next;
    });
  }

  useEffect(() => {
    // Only on mount — Refresh is the explicit re-fetch path.
    loadDiscovery(false);
  }, []);

  // Debounced so a fast typist doesn't recompute eight fuzzy matches per
  // keystroke — 400ms feels instant but coalesces the burst.
  const debouncedName = useDebouncedValue(name, 400);

  const suggestions = useMemo(() => {
    const out: Partial<Record<Platform, { id: string; score: number; credentialLabel: string | null }>> = {};
    if (!debouncedName.trim()) return out;
    for (const platform of PLATFORM_ORDER) {
      const state = discovery[platform];
      if (state.status === "loading" || state.accounts.length === 0) continue;
      const match = bestMatch(debouncedName, state.accounts);
      if (match) {
        out[platform] = {
          id: match.account.id,
          score: match.score,
          credentialLabel: match.account.credentialLabel ?? null,
        };
      }
    }
    return out;
  }, [debouncedName, discovery]);

  useEffect(() => {
    setRows((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const platform of PLATFORM_ORDER) {
        const suggestion = suggestions[platform];
        const row = prev[platform];
        if (row.dismissed) continue;
        if (!suggestion) {
          // The name changed enough that this platform no longer has a
          // confident match — clear a previous auto-fill, but never touch
          // something the user picked themselves.
          if (row.autoFilled && row.externalId) {
            next[platform] = emptyRow();
            changed = true;
          }
          continue;
        }
        if ((row.autoFilled || row.externalId === "") && row.externalId !== suggestion.id) {
          next[platform] = {
            ...row,
            externalId: suggestion.id,
            credentialLabel: suggestion.credentialLabel,
            autoFilled: true,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [suggestions]);

  function updateRow(platform: Platform, partial: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [platform]: { ...prev[platform], ...partial, autoFilled: false } }));
  }

  function addRow(platform: Platform) {
    setRows((prev) => ({ ...prev, [platform]: { ...prev[platform], open: true, dismissed: false } }));
  }

  function removeRow(platform: Platform) {
    setRows((prev) => ({ ...prev, [platform]: { ...emptyRow(), dismissed: true } }));
  }

  function handleSave() {
    setError(null);
    const mappings = PLATFORM_ORDER.filter((p) => rows[p].externalId.trim().length > 0).map((platform) => ({
      platform,
      externalId: rows[platform].externalId,
      active: true,
      credentialLabel: rows[platform].credentialLabel,
    }));

    startSaving(async () => {
      const result = await createClientWithMappings(name, timezone, mappings);
      if (result?.error) setError(result.error);
    });
  }

  const shownPlatforms = PLATFORM_ORDER.filter((p) => isShown(rows[p]));
  const hiddenPlatforms = PLATFORM_ORDER.filter((p) => !isShown(rows[p]));
  const stillLoading = PLATFORM_ORDER.some((p) => discovery[p].status === "loading");
  const connectedCount = PLATFORM_ORDER.filter((p) => rows[p].externalId.trim().length > 0).length;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Client name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
          autoFocus
          placeholder="e.g. Acme Roofing"
        />
        {editingTimezone ? (
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone" aria-label="Timezone" className="mt-1 w-full sm:w-72">
              <SelectValue placeholder="Select a timezone" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">
            Timezone: <span className="text-foreground">{timezone}</span> ·{" "}
            <button
              type="button"
              onClick={() => setEditingTimezone(true)}
              className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              change
            </button>
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <h3 className="text-sm font-medium text-foreground">Accounts</h3>
            <p className="text-xs text-muted-foreground">
              {stillLoading
                ? "Looking up accounts…"
                : !debouncedName.trim()
                  ? "Type the client's name and we'll find their accounts."
                  : connectedCount === 0
                    ? "No matching accounts found. Add them below, or skip and add them later."
                    : "Check these are the right accounts. You can also add or change them later."}
            </p>
          </div>
          <RefreshDiscoveryButton onRefresh={() => loadDiscovery(true)} />
        </div>

        {shownPlatforms.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border shadow-sm">
            {shownPlatforms.map((platform) => (
              <div
                key={platform}
                className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-start"
              >
                <div className="flex items-center gap-1.5 sm:w-36 sm:shrink-0 sm:pt-2">
                  <span className="text-sm font-medium text-foreground">{PLATFORM_LABELS[platform]}</span>
                  <PlatformHelpPopover help={PLATFORM_HELP[platform]} />
                </div>
                <div className="min-w-0 flex-1">
                  <AccountCombobox
                    platform={platform}
                    value={rows[platform].externalId}
                    onChange={(value) => updateRow(platform, { externalId: value })}
                    discovery={discovery[platform]}
                    suggestedId={suggestions[platform]?.id}
                    credentialLabel={rows[platform].credentialLabel}
                    onCredentialLabelChange={(credentialLabel) => updateRow(platform, { credentialLabel })}
                  />
                  {(platform === "ghl" || platform === "openphone") && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Not in the list?{" "}
                      <a
                        href={`/settings/api-keys?platform=${platform}&name=${encodeURIComponent(name)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        Add its API key
                      </a>{" "}
                      (new tab), then click Refresh accounts.
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeRow(platform)}
                  aria-label={`Remove ${PLATFORM_LABELS[platform]}`}
                  className="self-end sm:mt-1 sm:self-start"
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>
        )}

        {hiddenPlatforms.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Add:</span>
            {hiddenPlatforms.map((platform) => (
              <Button key={platform} type="button" variant="outline" size="xs" onClick={() => addRow(platform)}>
                <PlusIcon />
                {PLATFORM_LABELS[platform]}
              </Button>
            ))}
          </div>
        )}
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" onClick={handleSave} disabled={saving || name.trim().length === 0} className="self-start">
        {saving ? "Creating and checking accounts…" : "Create client"}
      </Button>
    </div>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeoutRef.current);
  }, [value, delayMs]);

  return debounced;
}
