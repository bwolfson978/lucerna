import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export { Skeleton };

export function MetricCardSkeleton() {
  return (
    <Card className="flex flex-col gap-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
    </Card>
  );
}

export function ChartSkeleton() {
  return (
    <Card>
      <Skeleton className="mb-4 h-4 w-48" />
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </Card>
  );
}

export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="flex flex-col gap-3">
      <Skeleton className="h-4 w-48" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </Card>
  );
}
