import { LockIcon } from "lucide-react";
import { LoginForm } from "./login-form";
import { NavBrand } from "@/components/nav-brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 50% 0%, color-mix(in oklch, var(--primary), transparent 90%), transparent)",
        }}
        aria-hidden
      />
      <div className="relative flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-3">
          <NavBrand />
          <ThemeToggle />
        </div>
        <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LockIcon className="size-4" aria-hidden />
            </div>
            <h1 className="mt-1 text-lg font-medium text-foreground">Settings sign-in</h1>
            <p className="text-sm text-muted-foreground">Client and platform mapping configuration.</p>
          </div>
          <LoginForm next={next && next.startsWith("/settings") ? next : "/settings/clients"} />
        </div>
      </div>
    </div>
  );
}
