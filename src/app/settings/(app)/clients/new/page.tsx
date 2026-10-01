import Link from "next/link";
import { ClientSetupForm } from "@/components/settings/client-setup-form";

const DEFAULT_TIMEZONE = process.env.DEFAULT_CLIENT_TIMEZONE ?? "America/New_York";

export default function NewClientPage() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href="/settings/clients" className="w-fit text-sm text-muted-foreground hover:text-foreground">
          ← All clients
        </Link>
        <h2 className="font-heading text-lg font-medium text-foreground">Add client</h2>
        <p className="text-sm text-muted-foreground">
          Type the client&apos;s name and we&apos;ll find their accounts for you. When you click &ldquo;Create
          client&rdquo;, we check each account works.
        </p>
      </div>

      <ClientSetupForm defaultTimezone={DEFAULT_TIMEZONE} />
    </div>
  );
}
