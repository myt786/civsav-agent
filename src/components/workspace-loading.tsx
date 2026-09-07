import { Skeleton } from "@/components/ui/skeleton";
export function WorkspaceLoading() {
  return (
    <div className="workspace" role="status" aria-label="Loading workspace">
      <span className="sr-only">Loading workspace</span>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="panel p-5">
        <Skeleton className="mb-7 h-10 w-48" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="mb-4 h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
