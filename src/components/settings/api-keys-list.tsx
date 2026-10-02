"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLineIcon, CheckIcon, CircleAlertIcon, CopyIcon, KeyRoundIcon, PencilIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deletePlatformCredential,
  moveEnvKeysToSaved,
  replacePlatformCredential,
  setGhlKeyLocation,
  type CredentialFormState,
} from "@/app/settings/credentials-actions";
import { ConfirmSubmitButton } from "@/components/settings/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { SegmentedFilter } from "@/components/ui/segmented-filter";
import { formatRelativeTime } from "@/lib/dashboard/format";

export interface ApiKeyRow {
  id: string;
  platform: "ghl" | "openphone";
  name: string;
  locationId: string | null;
  updatedAt: string;
  usedBy: number;
}

const PLATFORM_TITLE: Record<"ghl" | "openphone", string> = { ghl: "GoHighLevel", openphone: "OpenPhone" };

const initialState: CredentialFormState = {};

type ListFilter = "ghl" | "openphone";

function MoveEnvKeysButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await moveEnvKeysToSaved();
          toast(
            result.ok
              ? { variant: "success", title: "Keys moved", description: result.message }
              : { variant: "error", title: "Keys not moved", description: result.message },
          );
          router.refresh();
        })
      }
    >
      <ArrowDownToLineIcon className="size-3.5" />
      {pending ? "Moving…" : `Move ${count} in`}
    </Button>
  );
}

export function ApiKeysList({
  keys,
  unsavedEnvKeys,
  initialPlatform = "ghl",
}: {
  keys: ApiKeyRow[];
  // Env-var keys not yet copied into saved keys, per platform.
  unsavedEnvKeys: { ghl: number; openphone: number };
  initialPlatform?: ListFilter;
}) {
  const [platform, setPlatform] = useState<ListFilter>(initialPlatform);
  const [search, setSearch] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(false);

  const needsAttention = (row: ApiKeyRow) => row.usedBy === 0 || (row.platform === "ghl" && !row.locationId);
  const q = search.trim().toLowerCase();
  const rows = keys.filter(
    (row) =>
      row.platform === platform &&
      (!q || row.name.toLowerCase().includes(q) || (row.locationId ?? "").toLowerCase().includes(q)) &&
      (!onlyAttention || needsAttention(row)),
  );
  const platformCount = (p: ListFilter) => keys.filter((row) => row.platform === p).length;
  const attentionCount = keys.filter((row) => row.platform === platform && needsAttention(row)).length;
  const unsaved = unsavedEnvKeys[platform];

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">Saved keys</h3>
          <SegmentedFilter
            ariaLabel="Platform"
            value={platform}
            onChange={(value) => {
              setPlatform(value);
              setOnlyAttention(false);
            }}
            options={[
              { value: "ghl", label: "GoHighLevel", count: platformCount("ghl") },
              { value: "openphone", label: "OpenPhone", count: platformCount("openphone") },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={platform === "ghl" ? "Search by name or sub-account ID…" : "Search workspaces…"}
              className="h-9 pl-8"
              aria-label="Search keys"
            />
          </div>
          {attentionCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant={onlyAttention ? "default" : "outline"}
              className="h-9"
              onClick={() => setOnlyAttention((v) => !v)}
            >
              <CircleAlertIcon className="size-3.5" />
              {attentionCount} need a look
            </Button>
          )}
        </div>
        {unsaved > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
            <span className="text-xs text-foreground">
              {unsaved} {PLATFORM_TITLE[platform]} {unsaved === 1 ? "key is" : "keys are"} still only in Vercel.
            </span>
            <MoveEnvKeysButton count={unsavedEnvKeys.ghl + unsavedEnvKeys.openphone} />
          </div>
        )}
      </div>

      {rows.length > 0 ? (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <KeyRow key={row.id} row={row} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <KeyRoundIcon className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-foreground">
            {q || onlyAttention ? "No keys match" : `No ${PLATFORM_TITLE[platform]} keys yet`}
          </p>
          <p className="text-xs text-muted-foreground">
            {q || onlyAttention ? "Try a different search." : "Add one with the form — it's tested before it's saved."}
          </p>
        </div>
      )}
    </div>
  );
}

// A GoHighLevel sub-account key works for one location only. Keys moved in
// from the old setup without one ask for it here.
function GhlLocationForm({ row }: { row: ApiKeyRow }) {
  const [state, action, pending] = useActionState(setGhlKeyLocation.bind(null, row.id), initialState);
  const [locationId, setLocationId] = useState("");
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.error) toast({ variant: "error", title: "Sub-account ID not saved", description: state.error });
      else if (state.success) toast({ variant: "success", title: `${row.name}: ${state.success}` });
    }
    wasPending.current = pending;
  }, [pending, state.error, state.success, row.name]);

  return (
    <form action={action} className="flex flex-col gap-1.5 rounded-lg bg-warning/10 px-3 py-2.5">
      <label htmlFor={`loc-${row.id}`} className="text-xs text-foreground">
        <span className="font-medium">Sub-account ID needed.</span> This key belongs to one GoHighLevel sub-account —
        open it in GoHighLevel and copy the ID from the address bar (the part after <code>/location/</code>).
      </label>
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <Input
          id={`loc-${row.id}`}
          name="locationId"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          placeholder="e.g. WomOiaP51oX0hmVSsLYv"
          required
          className="h-8 flex-1 bg-card font-mono"
        />
        <Button type="submit" size="sm" disabled={pending || locationId.trim().length === 0}>
          {pending ? "Testing…" : "Test & save"}
        </Button>
      </div>
    </form>
  );
}

function KeyRow({ row }: { row: ApiKeyRow }) {
  const [replacing, setReplacing] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [replaceState, replaceAction, replacePending] = useActionState(
    replacePlatformCredential.bind(null, row.id),
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deletePlatformCredential.bind(null, row.id),
    initialState,
  );

  const wasReplacing = useRef(replacePending);
  useEffect(() => {
    if (wasReplacing.current && !replacePending) {
      if (replaceState.error) {
        toast({ variant: "error", title: "Key not replaced", description: replaceState.error });
      } else if (replaceState.success) {
        toast({ variant: "success", title: `${row.name}: ${replaceState.success}` });
        setReplacing(false);
        setNewKey("");
      }
    }
    wasReplacing.current = replacePending;
  }, [replacePending, replaceState.error, replaceState.success, row.name]);

  const wasDeleting = useRef(deletePending);
  useEffect(() => {
    if (wasDeleting.current && !deletePending && deleteState.error) {
      toast({ variant: "error", title: "Key not deleted", description: deleteState.error });
    }
    wasDeleting.current = deletePending;
  }, [deletePending, deleteState.error]);

  return (
    <li className="flex flex-col gap-2.5 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/30">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
            row.platform === "ghl" ? "bg-primary/10 text-primary" : "bg-chart-2/15 text-chart-2",
          )}
          aria-hidden
        >
          {row.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium",
                row.usedBy === 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success",
              )}
            >
              {row.usedBy === 0 ? "Not used" : `${row.usedBy} client${row.usedBy === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {row.platform === "ghl" && row.locationId && <CopyId label="Sub-account" value={row.locationId} />}
            <span title={new Date(row.updatedAt).toLocaleString()}>Updated {formatRelativeTime(new Date(row.updatedAt), new Date())}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={replacing ? "secondary" : "outline"}
            className="h-8"
            onClick={() => setReplacing((r) => !r)}
          >
            {replacing ? "Cancel" : (
              <>
                <PencilIcon className="size-3.5" />
                Replace
              </>
            )}
          </Button>
          <form action={deleteAction}>
            <ConfirmSubmitButton
              type="submit"
              size="icon-sm"
              variant="ghost"
              disabled={deletePending}
              aria-label={`Delete ${row.name}`}
              title="Delete key"
              className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              confirmMessage={`Delete the key "${row.name}"? You can add it again later if you need to.`}
            >
              <Trash2Icon className="size-3.5" />
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      {row.platform === "ghl" && !row.locationId && <GhlLocationForm row={row} />}

      {replacing && (
        <form action={replaceAction} className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-2.5 sm:flex-row">
          <Input
            name="apiKey"
            type="password"
            autoComplete="off"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Paste the new key"
            required
            autoFocus
            className="flex-1 bg-card font-mono"
          />
          <Button type="submit" size="sm" className="h-9" disabled={replacePending || newKey.trim().length === 0}>
            {replacePending ? "Testing…" : "Test & replace"}
          </Button>
        </form>
      )}

      {deleteState.error && <p className="text-xs text-destructive">{deleteState.error}</p>}
    </li>
  );
}

// An ID shown in full with a one-click copy, since it's mostly needed to
// paste somewhere else.
function CopyId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked — the ID is still visible to select by hand.
        }
      }}
      className="group flex min-w-0 items-center gap-1 rounded hover:text-foreground"
      title={`Copy ${label.toLowerCase()} ID`}
    >
      {label} <code className="truncate font-mono text-foreground/80">{value}</code>
      {copied ? <CheckIcon className="size-3 shrink-0 text-success" /> : <CopyIcon className="size-3 shrink-0 opacity-0 group-hover:opacity-100" />}
    </button>
  );
}
