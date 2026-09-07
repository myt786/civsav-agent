import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

// Shared by every top-level page (dashboard, insights, docs) via this route
// group — one persistent shell instance that survives navigation between
// them, so only the content area shows a loading.tsx skeleton instead of
// the whole page (sidebar included) flashing on every route change.
export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
