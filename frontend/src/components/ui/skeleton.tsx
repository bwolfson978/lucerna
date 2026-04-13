import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-glass-bg", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
