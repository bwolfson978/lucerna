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
  note,
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONES;
  /** A short line under the value, e.g. "across 3 years". */
  note?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="metric-label">{label}</span>
      <span className={`font-data text-[17px] font-semibold ${TONES[tone]}`} data-ui="stat-value">
        {value}
      </span>
      {note && <span className="text-caption text-text-tertiary">{note}</span>}
    </div>
  );
}
