"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ClientFormState } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";

const TIMEZONES =
  typeof Intl.supportedValuesOf === "function"
    ? ["UTC", ...Intl.supportedValuesOf("timeZone")]
    : ["UTC"];

const initialState: ClientFormState = {};

export function ClientForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (
    prevState: ClientFormState,
    formData: FormData,
  ) => Promise<ClientFormState>;
  defaultValues: { name: string; timezone: string; active: boolean };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [active, setActive] = useState(defaultValues.active);
  const [timezone, setTimezone] = useState(defaultValues.timezone);

  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      toast({ variant: "success", title: "Client saved" });
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        // Keep the saved controls in place; React's form-action reset can
        // dispatch the old value through Radix's hidden select and switch.
        startTransition(() => formAction(formData));
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaultValues.name}
          required
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <Select name="timezone" value={timezone} onValueChange={setTimezone}>
          <SelectTrigger id="timezone" className="w-full">
            <SelectValue placeholder="Select a timezone" />
          </SelectTrigger>
          <SelectContent>
            {Array.from(new Set([defaultValues.timezone, ...TIMEZONES])).map(
              (tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm text-foreground">Active</span>
          <span className="text-xs text-muted-foreground">
            Deactivating excludes this client from sync but keeps its history.
          </span>
        </div>
        <Switch
          aria-label="Include client in daily syncs"
          name="active"
          value="true"
          checked={active}
          onCheckedChange={setActive}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
