"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addPlatformCredential, type CredentialFormState } from "@/app/settings/credentials-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

type KeyPlatform = "ghl" | "openphone";

const PLATFORMS: { value: KeyPlatform; label: string }[] = [
  { value: "ghl", label: "GoHighLevel" },
  { value: "openphone", label: "OpenPhone" },
];

const initialState: CredentialFormState = {};

export function AddApiKeyForm({
  initialPlatform,
  initialName,
  clientId,
  clientName,
}: {
  initialPlatform: KeyPlatform;
  initialName: string;
  // Set when opened from a client's page: saving returns there, and a GHL
  // key is connected to that client straight away.
  clientId?: string;
  clientName?: string;
}) {
  const [state, formAction, pending] = useActionState(addPlatformCredential, initialState);
  // Controlled, so a failed test doesn't wipe the pasted key (React resets
  // uncontrolled fields after every form action).
  const [platform, setPlatform] = useState<KeyPlatform>(initialPlatform);
  const [name, setName] = useState(initialName);
  const [locationId, setLocationId] = useState("");
  const [apiKey, setApiKey] = useState("");

  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.error) {
        toast({ variant: "error", title: "Key not saved", description: state.error });
      } else if (state.success) {
        toast({ variant: "success", title: state.success });
        setName("");
        setLocationId("");
        setApiKey("");
      }
    }
    wasPending.current = pending;
  }, [pending, state.error, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border p-4 shadow-sm">
      <input type="hidden" name="platform" value={platform} />
      {clientId && <input type="hidden" name="clientId" value={clientId} />}

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          Add a key{clientName ? ` for ${clientName}` : ""}
        </h3>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Platform">
          {PLATFORMS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              role="radio"
              aria-checked={platform === option.value}
              variant={platform === option.value ? "default" : "outline"}
              onClick={() => setPlatform(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <HowToGetKey platform={platform} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="key-name">{platform === "ghl" ? "Client name" : "Workspace name"}</Label>
          <Input
            id="key-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder={platform === "ghl" ? "e.g. Acme Roofing" : "e.g. Acme Roofing workspace"}
          />
        </div>
        {platform === "ghl" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-location">Sub-account ID</Label>
            <Input
              id="key-location"
              name="locationId"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
              placeholder="Copied from the address bar"
              className="font-mono"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="key-value">API key</Label>
        <Input
          id="key-value"
          name="apiKey"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required
          className="font-mono"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Testing key…" : clientId && platform === "ghl" ? "Test, save & connect" : "Test & save"}
      </Button>
    </form>
  );
}

function HowToGetKey({ platform }: { platform: KeyPlatform }) {
  const steps =
    platform === "ghl"
      ? [
          "Open the client's sub-account in GoHighLevel.",
          "Go to Settings → Private Integrations → Create new integration. Tick “View Opportunities”, create it, and copy the key it shows you.",
          "Copy the sub-account ID from your browser's address bar — it's the part right after /location/.",
        ]
      : [
          "In OpenPhone, open the workspace the client's number lives in (you need to be an owner or admin).",
          "Go to Settings → API → Generate API key, and copy the key.",
          "One key covers every phone number in that workspace, so you only need to add it once."
        ];
  return (
    <ol className={cn("flex list-decimal flex-col gap-1 pl-5 text-xs text-muted-foreground")}>
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
