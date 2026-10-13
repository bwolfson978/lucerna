import type { ReactNode } from "react";
import { cn } from "./cn";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  /** Optional info control next to the label (the web app passes its tooltip). */
  info?: ReactNode;
  className?: string;
  valueClassName?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaType = "neutral",
  info,
  className,
  valueClassName,
}: MetricCardProps) {
  return (
    <div className={cn("card flex min-w-0 flex-col gap-2", className)} data-ui="metric-card">
      <span className="metric-label flex items-center gap-1">
        {label}
        {info}
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
    </div>
  );
}
