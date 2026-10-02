"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLineIcon, KeyRoundIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
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

export interface ApiKeyRow {
  id: string;
  platform: "ghl" | "openphone";
  name: string;
  locationId: string | null;
  updatedAt: string;
  usedBy: number;
}

const SECTIONS: { platform: "ghl" | "openphone"; title: string }[] = [
  { platform: "ghl", title: "GoHighLevel" },
  { platform: "openphone", title: "OpenPhone" },
];

const initialState: CredentialFormState = {};

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
      {pending ? "Moving…" : `Move ${count} older key${count === 1 ? "" : "s"} in`}
    </Button>
  );
}

export function ApiKeysList({
  keys,
  envKeyNames,
  unsavedEnvKeys,
}: {
  keys: ApiKeyRow[];
  envKeyNames: { ghl: string[]; openphone: string[] };
  // Env-var keys not yet copied into saved keys, per platform.
  unsavedEnvKeys: { ghl: number; openphone: number };
}) {
  const unsavedTotal = unsavedEnvKeys.ghl + unsavedEnvKeys.openphone;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">Saved keys</h3>
        {unsavedTotal > 0 && <MoveEnvKeysButton count={unsavedTotal} />}
      </div>
      {SECTIONS.map(({ platform, title }) => {
        const rows = keys.filter((key) => key.platform === platform);
        const envNames = envKeyNames[platform];
        return (
          <section key={platform} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
              <span className="text-xs text-muted-foreground tabular-nums">
                {/* Saved keys plus any not moved in yet — a moved key exists in
                    both places and must only count once. */}
                {rows.length + unsavedEnvKeys[platform]} {rows.length + unsavedEnvKeys[platform] === 1 ? "key" : "keys"}
              </span>
            </div>
            {rows.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border">
                {rows.map((row) => (
                  <KeyRow key={row.id} row={row} />
                ))}
              </div>
            )}
            {rows.length === 0 && envNames.length === 0 && (
              <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                <KeyRoundIcon className="size-4 shrink-0" aria-hidden />
                No {title} keys yet — add one on the left.
              </p>
            )}
            {unsavedEnvKeys[platform] > 0 ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-xs text-muted-foreground">
                <ArrowDownToLineIcon className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                  {unsavedEnvKeys[platform]} {unsavedEnvKeys[platform] === 1 ? "key is" : "keys are"} still set up the old
                  way, by a developer in Vercel. They work, but can&apos;t be seen or replaced here — use{" "}
                  <span className="font-medium text-foreground">Move older keys in</span> above.
                </span>
              </p>
            ) : (
              envNames.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                  <ShieldCheckIcon className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
                  <span>
                    Older keys moved in. The copies in Vercel can now be removed (optional).
                  </span>
                </p>
              )
            )}
          </section>
        );
      })}
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
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/30">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <KeyRoundIcon className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("shrink-0", row.usedBy === 0 && "text-warning")}>
              {row.usedBy === 0 ? "Not used by any client" : `Used by ${row.usedBy} client${row.usedBy === 1 ? "" : "s"}`}
            </span>
            {row.platform === "ghl" && row.locationId && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate" title={`Sub-account ID ${row.locationId}`}>
                  Sub-account <code className="text-foreground/80">{row.locationId}</code>
                </span>
              </>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => setReplacing((r) => !r)}>
            {replacing ? "Cancel" : "Replace"}
          </Button>
          <form action={deleteAction}>
            <ConfirmSubmitButton
              type="submit"
              size="icon-sm"
              variant="ghost"
              disabled={deletePending}
              aria-label={`Delete ${row.name}`}
              title="Delete key"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              confirmMessage={`Delete the key "${row.name}"? You can add it again later if you need to.`}
            >
              <Trash2Icon className="size-3.5" />
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      {row.platform === "ghl" && !row.locationId && <GhlLocationForm row={row} />}

      {replacing && (
        <form action={replaceAction} className="flex flex-col gap-1.5 sm:flex-row">
          <Input
            name="apiKey"
            type="password"
            autoComplete="off"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Paste the new key"
            required
            className="flex-1 font-mono"
          />
          <Button type="submit" size="sm" disabled={replacePending} className="sm:mt-0.5">
            {replacePending ? "Testing…" : "Test & replace"}
          </Button>
        </form>
      )}

      {deleteState.error && <p className="text-xs text-destructive">{deleteState.error}</p>}
    </div>
  );
}
