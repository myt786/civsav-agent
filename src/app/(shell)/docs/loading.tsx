import { Skeleton } from "@/components/ui/skeleton";

export default function DocsLoading() {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[1fr_220px]">
      <div className="flex flex-col gap-3 border-b border-border pb-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="hidden lg:block" />
    </div>
  );
}
