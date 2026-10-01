import { MetricCard as SharedMetricCard } from "@lucerna/ui";
import { Tooltip } from "@/components/common/Tooltip";

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  tooltip?: string;
  className?: string;
  valueClassName?: string;
}

/** The shared MetricCard (ui/) with the web app's tooltip in its info slot. */
export function MetricCard({ tooltip, ...props }: MetricCardProps) {
  return <SharedMetricCard {...props} info={tooltip ? <Tooltip content={tooltip} /> : undefined} />;
}
