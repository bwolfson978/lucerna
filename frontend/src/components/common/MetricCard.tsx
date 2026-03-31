import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  className?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaType = "neutral",
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("flex flex-col gap-2", className)}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {delta && (
        <span
          className={cn(
            "text-body-sm font-medium",
            deltaType === "positive" && "text-optimal",
            deltaType === "negative" && "text-negative",
            deltaType === "neutral" && "text-text-secondary"
          )}
        >
          {delta}
        </span>
      )}
    </Card>
  );
}
