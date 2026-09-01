import { Skeleton } from "@/components/ui/skeleton";

// Shown in the shared (shell) layout's content slot while the dashboard's
// live DB queries are in flight — the sidebar stays mounted and interactive
// the whole time since it lives in the layout, not here.
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-24 rounded-lg" />

      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
