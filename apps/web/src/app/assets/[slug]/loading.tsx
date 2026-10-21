import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="w-2/3" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-chart" />
    </div>
  );
}
