import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse bg-glass-bg rounded-lg", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
