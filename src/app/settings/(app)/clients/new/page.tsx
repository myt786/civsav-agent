import { ClientSetupForm } from "@/components/settings/client-setup-form";
import Link from "next/link";

const DEFAULT_TIMEZONE =
  process.env.DEFAULT_CLIENT_TIMEZONE ?? "America/New_York";

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/settings/clients"
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to client directory
      </Link>
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          Welcome a new client
        </h2>
        <p className="text-sm text-muted-foreground">
          Add their profile, then choose the accounts that belong to them.
          Connections can also be added later.
        </p>
      </div>

      <ClientSetupForm defaultTimezone={DEFAULT_TIMEZONE} />
    </div>
  );
}
