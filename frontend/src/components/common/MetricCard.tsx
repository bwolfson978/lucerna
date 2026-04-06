import { useRef, useEffect, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/common/Tooltip";
import { cn } from "@/lib/utils";

/**
 * Renders children at full size, then scales the font down if the text
 * overflows its container. Prevents values like "+$89,773" from breaking
 * out of narrow grid cells.
 */
function FittedValue({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset to natural size
    el.style.fontSize = "";
    // Shrink until it fits or we hit a floor
    const minScale = 0.6;
    let scale = 1;
    while (el.scrollWidth > el.clientWidth && scale > minScale) {
      scale -= 0.05;
      el.style.fontSize = `${scale}em`;
    }
  }, [children]);

  return (
    <span ref={ref} className={cn(className, "block overflow-hidden whitespace-nowrap")}>
      {children}
    </span>
  );
}

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
    <Card className={cn("flex flex-col gap-2 min-w-0", className)}>
      <span className="metric-label flex items-center gap-1">
        {label}
        {tooltip && <Tooltip content={tooltip} />}
      </span>
      <FittedValue className={cn("metric-value", valueClassName)}>{value}</FittedValue>
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
