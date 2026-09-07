"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="you@company.com" required autoFocus />
        <p className="text-xs text-muted-foreground">Used to attribute changes in the audit log.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
