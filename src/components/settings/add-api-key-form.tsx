"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ExternalLinkIcon, EyeIcon, EyeOffIcon, LockIcon, PhoneIcon, UsersIcon } from "lucide-react";
import { addPlatformCredential, type CredentialFormState } from "@/app/settings/credentials-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

type KeyPlatform = "ghl" | "openphone";

const PLATFORMS: { value: KeyPlatform; label: string; note: string; icon: typeof UsersIcon }[] = [
  { value: "ghl", label: "GoHighLevel", note: "One key per client sub-account", icon: UsersIcon },
  { value: "openphone", label: "OpenPhone", note: "One key per workspace", icon: PhoneIcon },
];

const PLATFORM_LINK: Record<KeyPlatform, { label: string; href: string }> = {
  ghl: { label: "Open GoHighLevel", href: "https://app.gohighlevel.com/" },
  openphone: { label: "Open OpenPhone API settings", href: "https://my.openphone.com/settings/api" },
};

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
  const [showKey, setShowKey] = useState(false);

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

  const ready = name.trim() !== "" && apiKey.trim() !== "" && (platform !== "ghl" || locationId.trim() !== "");

  return (
    <form action={formAction} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <input type="hidden" name="platform" value={platform} />
      {clientId && <input type="hidden" name="clientId" value={clientId} />}

      <div className="flex flex-col gap-3 border-b border-border p-4">
        <h3 className="text-sm font-medium text-foreground">Add a key{clientName ? ` for ${clientName}` : ""}</h3>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Platform">
          {PLATFORMS.map((option) => {
            const selected = platform === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPlatform(option.value)}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                  selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
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
                placeholder="e.g. WomOiaP51oX0hmVSsLYv"
                className="font-mono"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="key-value">API key</Label>
          <div className="relative">
            <Input
              id="key-value"
              name="apiKey"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              placeholder="Paste the key here"
              className="pr-10 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>

        {state.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LockIcon className="size-3.5" />
          Tested before saving, then stored encrypted.
        </span>
        <Button type="submit" disabled={pending || !ready}>
          {pending ? "Testing key…" : clientId && platform === "ghl" ? "Test, save & connect" : "Test & save"}
        </Button>
      </div>
    </form>
  );
}

function HowToGetKey({ platform }: { platform: KeyPlatform }) {
  const steps =
    platform === "ghl"
      ? [
          "Open the client's sub-account in GoHighLevel.",
          "Go to Settings → Private Integrations → Create new integration. Tick “View Opportunities”, create it, and copy the key.",
          "Copy the sub-account ID from the address bar — the part right after /location/.",
        ]
      : [
          "Open the workspace the client's number lives in (owner or admin access needed).",
          "Go to Settings → API → Generate API key, and copy it.",
          "One key covers every number in that workspace — add it once.",
        ];
  const link = PLATFORM_LINK[platform];
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">Where to find it</span>
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {link.label}
          <ExternalLinkIcon className="size-3" />
        </a>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2.5 text-xs text-muted-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-medium text-foreground ring-1 ring-border">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
