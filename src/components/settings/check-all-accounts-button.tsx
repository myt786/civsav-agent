"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheckIcon } from "lucide-react";
import { checkAllUncheckedAccounts } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

export function CheckAllAccountsButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await checkAllUncheckedAccounts();
      router.refresh();

      if (result.checked === 0 && result.remaining === 0) {
        toast({ variant: "success", title: "Nothing to check", description: "Every connected account is already working." });
        return;
      }

      const parts = [`${result.working} working`];
      if (result.notWorking > 0) parts.push(`${result.notWorking} not working — open those clients to see why`);
      const description =
        result.remaining > 0
          ? `${parts.join(", ")}. ${result.remaining} more still to check — click again to carry on.`
          : `${parts.join(", ")}.`;

      toast({
        variant: result.notWorking > 0 ? "error" : "success",
        title: `Checked ${result.checked} account${result.checked === 1 ? "" : "s"}`,
        description,
      });
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleClick}>
      <CheckCheckIcon className="size-3.5" aria-hidden />
      {pending ? "Checking accounts… (can take a few minutes)" : "Check all accounts"}
    </Button>
  );
}
