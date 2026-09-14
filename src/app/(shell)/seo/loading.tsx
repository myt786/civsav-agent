import { Skeleton } from "@/components/ui/skeleton";

export default function SeoDashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
