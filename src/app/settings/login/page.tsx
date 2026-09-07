import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { LoginForm } from "./login-form";
import { NavBrand } from "@/components/nav-brand";
export const metadata = { title: "Settings sign-in" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-9">
          <NavBrand />
        </div>
        <div className="panel px-7 py-9 sm:px-9">
          <p className="eyebrow mb-4">Agency workspace</p>
          <h1 className="page-title">Sign in to your workspace.</h1>
          <p className="mb-8 mt-4 text-sm leading-relaxed text-muted-foreground">
            Sign in to manage your clients and their connected platforms.
          </p>
          <LoginForm
            next={
              next && next.startsWith("/settings") ? next : "/settings/clients"
            }
          />
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to client overview
        </Link>
      </div>
    </main>
  );
}
