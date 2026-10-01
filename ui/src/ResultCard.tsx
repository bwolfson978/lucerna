"use client";

import { useState } from "react";
import { BalanceComparison, type BalanceComparisonData } from "./BalanceComparison";
import { BracketFillChart, type BracketFillData } from "./BracketFillChart";
import { ConversionStrip, type ConversionYear } from "./ConversionStrip";
import { formatCompactCurrency, formatSavings } from "./format";
import { Stat } from "./Stat";

/**
 * What the result card shows. This is the `structuredContent` that
 * `analyze_roth_conversions` returns (backend/app/tools/core.py summarize_result);
 * the parity fixture shared/fixtures/view-data.json keeps the two aligned.
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

/** Chart series for the card's "more detail" panels: the analyze tool's View `_meta`
 * (backend app/tools/views.py result_view). */
export interface ResultDetails {
  bracket_fill?: BracketFillData;
  balances?: BalanceComparisonData;
}

export function isResultDetails(value: unknown): value is ResultDetails {
  const v = value as ResultDetails | undefined;
  return (
    !!v &&
    typeof v === "object" &&
    (Array.isArray(v.bracket_fill?.years) || Array.isArray(v.balances?.points))
  );
}

const PANELS = [
  { id: "bracket_fill", label: "Tax brackets by year" },
  { id: "balances", label: "Balances over time" },
] as const;

function DetailPanels({ details }: { details: ResultDetails }) {
  const [open, setOpen] = useState<(typeof PANELS)[number]["id"] | null>(null);
  const available = PANELS.filter((p) => details[p.id]);
  if (!available.length) return null;
  return (
    <div className="gap-default flex flex-col" data-ui="result-details">
      <div className="flex flex-wrap gap-2" role="group" aria-label="More detail">
        {available.map((panel) => {
          const selected = open === panel.id;
          return (
            <button
              key={panel.id}
              type="button"
              aria-expanded={selected}
              onClick={() => setOpen(selected ? null : panel.id)}
              className={
                selected
                  ? "border-pine bg-pine min-h-[36px] rounded-full border px-3.5 text-[13.5px] font-medium text-white transition-colors"
                  : "border-border text-text-primary hover:border-pine-mid hover:text-pine min-h-[36px] rounded-full border bg-white px-3.5 text-[13.5px] font-medium transition-colors"
              }
            >
              {panel.label}
            </button>
          );
        })}
      </div>
      {open === "bracket_fill" && details.bracket_fill && (
        <BracketFillChart data={details.bracket_fill} framed={false} />
      )}
      {open === "balances" && details.balances && (
        <BalanceComparison data={details.balances} framed={false} />
      )}
    </div>
  );
}

interface ResultCardProps {
  data: ResultCardData;
  /** Optional charts behind "more detail" toggles. */
  details?: ResultDetails;
  /** Open the complete analysis. Omit to hide the button. */
  onOpenFullResults?: () => void;
}

/**
 * Headline result of an analysis. Rendered natively by the web app and, unchanged,
 * inside the `ui://roth-conversions/result-card.html` MCP App View.
 */
export function ResultCard({ data, details, onOpenFullResults }: ResultCardProps) {
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
      {details && <DetailPanels details={details} />}
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
