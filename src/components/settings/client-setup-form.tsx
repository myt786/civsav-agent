"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  active: boolean;
  // Only meaningful for a platform whose accounts are split across
  // several per-tenant credentials (OpenPhone) — see PlatformAccount.
  // credentialLabel. Null for every other platform.
  credentialLabel: string | null;
  // Whether the current externalId was set by the suggestion engine rather
  // than a deliberate user pick — only auto-filled rows get overwritten as
  // the client name keeps changing; anything the user has touched is left
  // alone even if a better-scoring suggestion shows up later.
  autoFilled: boolean;
}

function emptyRow(): RowState {
  return { externalId: "", active: true, credentialLabel: null, autoFilled: false };
}

export function ClientSetupForm({ defaultTimezone }: { defaultTimezone: string }) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
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
            externalId: suggestion.id,
            active: true,
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

  function handleSave() {
    setError(null);
    const mappings = PLATFORM_ORDER.filter((p) => rows[p].externalId.trim().length > 0).map((platform) => ({
      platform,
      externalId: rows[platform].externalId,
      active: rows[platform].active,
      credentialLabel: rows[platform].credentialLabel,
    }));

    startSaving(async () => {
      const result = await createClientWithMappings(name, timezone, mappings);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-md rounded-lg border border-border p-4">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone" className="w-full">
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
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <h3 className="text-sm font-medium text-foreground">Platform mappings</h3>
            <p className="text-xs text-muted-foreground">
              Matching accounts are suggested automatically as you type the client&apos;s name — confirm or search
              instead.
            </p>
          </div>
          <RefreshDiscoveryButton onRefresh={() => loadDiscovery(true)} />
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          {PLATFORM_ORDER.map((platform) => (
            <div key={platform} className="flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-b-0">
              <div className="flex items-center gap-1.5">
                <span className="w-32 shrink-0 text-sm font-medium text-foreground">
                  {PLATFORM_LABELS[platform]}
                </span>
                <PlatformHelpPopover help={PLATFORM_HELP[platform]} />
              </div>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-64 flex-1">
                  <AccountCombobox
                    platform={platform}
                    value={rows[platform].externalId}
                    onChange={(value) => updateRow(platform, { externalId: value })}
                    discovery={discovery[platform]}
                    suggestedId={suggestions[platform]?.id}
                    credentialLabel={rows[platform].credentialLabel}
                    onCredentialLabelChange={(credentialLabel) => updateRow(platform, { credentialLabel })}
                  />
                </div>
                <div className="flex items-center gap-1.5 pt-1.5">
                  <Switch
                    checked={rows[platform].active}
                    onCheckedChange={(active) => updateRow(platform, { active })}
                    size="sm"
                  />
                  <span className="text-xs text-muted-foreground">active</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" onClick={handleSave} disabled={saving || name.trim().length === 0} className="self-start">
        {saving ? "Creating…" : "Create client"}
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
