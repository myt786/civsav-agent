import { Skeleton } from "@/components/ui/skeleton";

export default function InsightsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
