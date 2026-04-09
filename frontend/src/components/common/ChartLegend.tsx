/**
 * Reusable chart legend component.
 * Renders colored swatches with labels, extracted from duplicated patterns
 * in ResultsView and BracketChart.
 */

interface LegendItem {
  color: string;
  label: string;
  /** Use a border style instead of solid fill (for "remaining" swatches). */
  outline?: boolean;
}

interface ChartLegendProps {
  items: LegendItem[];
  className?: string;
}

export function ChartLegend({ items, className }: ChartLegendProps) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-body-sm text-text-secondary ${className ?? ""}`}>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            className={`w-3 h-3 rounded ${item.outline ? "bg-bg-hover border border-border" : ""}`}
            style={item.outline ? undefined : { backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
