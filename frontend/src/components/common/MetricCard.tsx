import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/common/Tooltip";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  tooltip?: string;
  className?: string;
  valueClassName?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaType = "neutral",
  tooltip,
  className,
  valueClassName,
}: MetricCardProps) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className="metric-label flex items-center gap-1">
        {label}
        {tooltip && <Tooltip content={tooltip} />}
      </span>
      <span className={cn("metric-value", valueClassName)}>{value}</span>
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
