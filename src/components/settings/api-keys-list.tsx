"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import {
  deletePlatformCredential,
  replacePlatformCredential,
  type CredentialFormState,
} from "@/app/settings/credentials-actions";
import { ConfirmSubmitButton } from "@/components/settings/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
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

export function ApiKeysList({
  keys,
  envKeyNames,
}: {
  keys: ApiKeyRow[];
  envKeyNames: { ghl: string[]; openphone: string[] };
}) {
  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map(({ platform, title }) => {
        const rows = keys.filter((key) => key.platform === platform);
        const envNames = envKeyNames[platform];
        return (
          <section key={platform} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved keys yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border shadow-sm">
                {rows.map((row) => (
                  <KeyRow key={row.id} row={row} />
                ))}
              </div>
            )}
            {envNames.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Also configured in Vercel (still works): <span className="font-mono">{envNames.join(", ")}</span>
              </p>
            )}
          </section>
        );
      })}
    </div>
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
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
          {row.locationId && <span className="truncate font-mono text-xs text-muted-foreground">{row.locationId}</span>}
          <Badge variant="outline" className="shrink-0 text-muted-foreground">
            {row.usedBy === 0 ? "not used yet" : `used by ${row.usedBy} client${row.usedBy === 1 ? "" : "s"}`}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setReplacing((r) => !r)}>
            {replacing ? "Cancel" : "Replace key"}
          </Button>
          <form action={deleteAction}>
            <ConfirmSubmitButton
              type="submit"
              size="sm"
              variant="ghost"
              disabled={deletePending}
              confirmMessage={`Delete the saved key "${row.name}"?`}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

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
