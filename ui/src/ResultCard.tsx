import { ConversionStrip, type ConversionYear } from "./ConversionStrip";
import { formatCompactCurrency, formatSavings } from "./format";

/**
 * What the result card shows. This is the `structuredContent` that
 * `analyze_roth_conversions` returns (backend/app/tools/core.py summarize_result);
 * the parity fixture shared/fixtures/result-card-data.json keeps the two aligned.
 */
export interface ResultCardData {
  result_id: string;
  estimated_lifetime_tax_savings_todays_dollars: number;
  total_conversion: number;
  total_tax_on_conversions: number;
  years_with_conversions: number;
  schedule_by_year: ConversionYear[];
}

export function isResultCardData(value: unknown): value is ResultCardData {
  const v = value as ResultCardData | undefined;
  return (
    !!v &&
    typeof v.result_id === "string" &&
    typeof v.estimated_lifetime_tax_savings_todays_dollars === "number" &&
    typeof v.total_conversion === "number" &&
    typeof v.total_tax_on_conversions === "number" &&
    typeof v.years_with_conversions === "number" &&
    Array.isArray(v.schedule_by_year)
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="metric-label">{label}</span>
      <span className="font-data text-text-primary text-[17px] font-semibold" data-ui="stat-value">
        {value}
      </span>
    </div>
  );
}

interface ResultCardProps {
  data: ResultCardData;
  /** Open the complete analysis. Omit to hide the button. */
  onOpenFullResults?: () => void;
}

/**
 * Headline result of an analysis. Rendered natively by the web app and, unchanged,
 * inside the `ui://roth-conversions/result-card.html` MCP App View.
 */
export function ResultCard({ data, onOpenFullResults }: ResultCardProps) {
  return (
    <article className="card-recommended gap-comfortable flex flex-col" data-ui="result-card">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow" data-ui="eyebrow">
          Estimated lifetime tax savings
        </span>
        <span className="metric-value-hero text-pine" data-ui="hero">
          {formatSavings(data.estimated_lifetime_tax_savings_todays_dollars)}
        </span>
        <span className="text-caption text-text-tertiary">
          In today&apos;s dollars, compared with not converting
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Converted" value={formatCompactCurrency(data.total_conversion)} />
        <Stat label="Tax cost" value={formatCompactCurrency(data.total_tax_on_conversions)} />
        <Stat label="Years" value={String(data.years_with_conversions)} />
      </div>
      <ConversionStrip schedule={data.schedule_by_year} />
      {onOpenFullResults && (
        <div className="border-border pt-default flex flex-wrap items-center gap-3 border-t">
          <button type="button" className="btn-dark" onClick={onOpenFullResults} data-ui="cta">
            See full results
          </button>
          <span className="text-caption text-text-tertiary">
            Slider, scenario comparison, year-by-year table
          </span>
        </div>
      )}
    </article>
  );
}
