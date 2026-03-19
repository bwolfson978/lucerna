interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  tooltip?: string;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaType = "neutral",
}: MetricCardProps) {
  const deltaColor =
    deltaType === "positive"
      ? "text-optimal"
      : deltaType === "negative"
        ? "text-negative"
        : "text-text-secondary";

  return (
    <div className="card flex flex-col gap-2">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {delta && (
        <span className={`text-body-sm font-medium ${deltaColor}`}>
          {delta}
        </span>
      )}
    </div>
  );
}
