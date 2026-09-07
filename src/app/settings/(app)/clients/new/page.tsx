import { ClientSetupForm } from "@/components/settings/client-setup-form";

const DEFAULT_TIMEZONE = process.env.DEFAULT_CLIENT_TIMEZONE ?? "America/New_York";

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-foreground">Add client</h2>
        <p className="text-sm text-muted-foreground">
          We never ask you to look up or paste a platform ID — pick the matching account from each list, or search
          if it&apos;s not the one we guessed.
        </p>
      </div>

      <ClientSetupForm defaultTimezone={DEFAULT_TIMEZONE} />
    </div>
  );
}
