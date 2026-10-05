"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/clients", label: "Clients" },
  { href: "/settings/api-keys", label: "API keys" },
  { href: "/settings/email-reports", label: "Email reports" },
  { href: "/settings/team", label: "Team" },
];

export function SettingsTabs({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex items-end justify-between gap-4 border-b border-border">
      <nav className="flex gap-5 text-sm" aria-label="Settings sections">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 pb-2 transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {/* Right end of the tab row, clear of the floating AI button that sits
          in the page's top-right corner. */}
      {children && <div className="pb-1.5">{children}</div>}
    </div>
  );
}
