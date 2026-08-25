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
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-3">
          <NavBrand />
          <ThemeToggle />
        </div>
        <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-medium text-foreground">Settings sign-in</h1>
            <p className="text-sm text-muted-foreground">Client and platform mapping configuration.</p>
          </div>
          <LoginForm next={next && next.startsWith("/settings") ? next : "/settings/clients"} />
        </div>
      </div>
    </div>
  );
}
