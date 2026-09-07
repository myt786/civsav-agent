import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
