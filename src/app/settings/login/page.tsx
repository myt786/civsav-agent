import Image from "next/image";
import { BarChart3Icon, BellRingIcon, SparklesIcon } from "lucide-react";
import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme-toggle";

const HIGHLIGHTS = [
  { icon: BarChart3Icon, text: "Leads, calls, ads and SEO for every client in one place" },
  { icon: BellRingIcon, text: "Daily alerts when something needs a look" },
  { icon: SparklesIcon, text: "Ask questions about your clients in plain English" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel — large screens only. */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex"
        style={{
          background:
            "linear-gradient(145deg, color-mix(in oklch, var(--primary), black 30%), var(--primary) 55%, color-mix(in oklch, var(--primary), white 15%))",
        }}
      >
        <div
          className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-black/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <Image src="/civsav-icon.png" alt="" width={36} height={36} className="rounded-lg bg-white/90 p-1" priority />
          <span className="font-heading text-lg font-semibold tracking-tight">Civilized Savage</span>
        </div>

        <div className="relative flex max-w-md flex-col gap-6">
          <h2 className="font-heading text-3xl leading-tight font-semibold tracking-tight">
            Every client&apos;s numbers, one calm place.
          </h2>
          <ul className="flex flex-col gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">Client reporting dashboard · internal use</p>
      </div>

      {/* Sign-in form. */}
      <div className="relative flex flex-col px-6 py-8 sm:px-10">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-72 lg:hidden"
          style={{
            background: "radial-gradient(60% 100% at 50% 0%, color-mix(in oklch, var(--primary), transparent 88%), transparent)",
          }}
          aria-hidden
        />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2 lg:invisible">
            <Image src="/civsav-icon.png" alt="" width={26} height={26} className="rounded-md" priority />
            <span className="font-heading text-sm font-semibold">Civilized Savage</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="relative flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
              <p className="text-sm text-muted-foreground">Sign in to see your clients&apos; dashboard.</p>
            </div>
            <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />
          </div>
        </div>

        <p className="relative text-center text-xs text-muted-foreground">
          Trouble signing in? Ask whoever manages the app for the password.
        </p>
      </div>
    </div>
  );
}
