const TONES = {
  default: "text-text-primary",
  positive: "text-pine-mid",
  negative: "text-negative",
} as const;

/** A small labeled number inside a card. */
export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="metric-label">{label}</span>
      <span className={`font-data text-[17px] font-semibold ${TONES[tone]}`} data-ui="stat-value">
        {value}
      </span>
    </div>
  );
}
