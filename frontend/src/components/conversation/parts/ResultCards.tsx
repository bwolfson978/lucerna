"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import type { StoredResult } from "@/lib/agent/types";
import type { OptimizationResult } from "@/lib/types";
import { formatCompactCurrency, formatCurrency, formatSavings } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";
import { useConversationContext } from "../ConversationContext";
import { BalanceLines, BracketScheduleChart, CompareBars, ConversionStrip } from "./charts";

/** Look up a result, recomputing it if it was dropped from session storage. */
function useStoredResult(id: string): StoredResult | undefined {
  const { results, ensureResult } = useConversationContext();
  const stored = results[id];
  const missing = stored != null && stored.result == null;
  useEffect(() => {
    if (missing) ensureResult(id);
  }, [missing, ensureResult, id]);
  return stored;
}

function Pending({ label = "Loading this result" }: { label?: string }) {
  return (
    <div className="card animate-pulse text-body-sm text-text-tertiary" role="status">
      {label}…
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="metric-label">{label}</span>
      <span className="font-data text-[17px] font-semibold text-text-primary">{value}</span>
    </div>
  );
}

function openFull(openResults: (id: string) => void, id: string, from: string) {
  posthog.capture("full_results_opened", { from });
  openResults(id);
}

// --------------------------------------------------------------------------

export function ResultHeadlineCard({ resultId }: { resultId: string }) {
  const { openResults } = useConversationContext();
  const stored = useStoredResult(resultId);
  if (!stored) return null;
  const result = stored.result;
  if (!result) return <Pending />;
  const years = result.yearly_conversions.filter((c) => c > 0).length;

  return (
    <div className="card-recommended flex flex-col gap-comfortable" data-testid="result-headline">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Estimated lifetime tax savings</span>
        <span className="metric-value-hero text-pine">
          {formatSavings(result.estimated_lifetime_tax_savings)}
        </span>
        <span className="text-caption text-text-tertiary">
          In today&apos;s dollars, compared with not converting
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Converted" value={formatCompactCurrency(result.total_conversion)} />
        <Stat label="Tax cost" value={formatCompactCurrency(result.total_tax_on_conversions)} />
        <Stat label="Years" value={String(years)} />
      </div>
      <ConversionStrip result={result} />
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-default">
        <button
          type="button"
          className="btn-dark"
          onClick={() => openFull(openResults, resultId, "headline")}
        >
          See full results
        </button>
        <span className="text-caption text-text-tertiary">
          Slider, scenario comparison, year-by-year table
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------

export function BracketFillPart({ resultId }: { resultId: string }) {
  const stored = useStoredResult(resultId);
  if (!stored) return null;
  if (!stored.result) return <Pending />;
  return <BracketScheduleChart result={stored.result} />;
}

// --------------------------------------------------------------------------

function peakRmd(result: OptimizationResult, without: boolean): number | null {
  const projection = without ? result.rmd_projection_no_conversion : result.rmd_projection;
  return projection?.peak_rmd_amount ?? null;
}

export function BalanceComparisonCard({ resultId }: { resultId: string }) {
  const stored = useStoredResult(resultId);
  if (!stored) return null;
  const result = stored.result;
  if (!result) return <Pending />;
  const peakWith = peakRmd(result, false);
  const peakWithout = peakRmd(result, true);
  const wealthGain = result.npv_at_optimal - result.npv_at_zero;

  return (
    <div className="card flex flex-col gap-comfortable" data-testid="balance-comparison">
      <h3 className="text-h3 text-text-primary">Your traditional balance over time</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Roth at retirement" value={formatCompactCurrency(result.roth_at_retirement)} />
        {peakWith != null && peakWithout != null && (
          <Stat
            label="Largest RMD"
            value={`${formatCompactCurrency(peakWith)} vs ${formatCompactCurrency(peakWithout)}`}
          />
        )}
        <Stat label="After-tax wealth" value={formatSavings(wealthGain)} />
      </div>
      <BalanceLines result={result} />
      <p className="text-caption text-text-tertiary">
        Traditional balances are taxed when withdrawn, and required minimum distributions grow with
        them. Roth balances are not taxed. Amounts are projected, not in today&apos;s dollars.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------

export function ScenarioCompareCard({
  resultId,
  baseResultId,
  label,
}: {
  resultId: string;
  baseResultId: string;
  label: string;
}) {
  const { openResults, applyWhatIf, streaming } = useConversationContext();
  const [applied, setApplied] = useState(false);
  const variant = useStoredResult(resultId);
  const base = useStoredResult(baseResultId);
  if (!variant || !base) return null;
  if (!variant.result || !base.result) return <Pending />;
  const diff =
    variant.result.estimated_lifetime_tax_savings - base.result.estimated_lifetime_tax_savings;

  return (
    <div className="card flex flex-col gap-comfortable" data-testid="scenario-compare">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">What if</span>
        <h3 className="font-serif text-[22px] font-semibold leading-tight text-text-primary">
          {label}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Savings now"
          value={formatCurrency(base.result.estimated_lifetime_tax_savings)}
        />
        <Stat
          label="With this change"
          value={formatCurrency(variant.result.estimated_lifetime_tax_savings)}
        />
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="metric-label">Difference</span>
          <span
            className={cn(
              "font-data text-[17px] font-semibold",
              diff >= 0 ? "text-pine-mid" : "text-negative"
            )}
          >
            {diff >= 0 ? "+" : "-"}
            {formatCurrency(Math.abs(diff))}
          </span>
        </div>
      </div>
      <CompareBars base={base.result} variant={variant.result} variantLabel={label} />
      <div className="flex flex-wrap gap-3 border-t border-border pt-default">
        <button
          type="button"
          className="btn-dark"
          onClick={() => openFull(openResults, resultId, "what_if")}
        >
          See full results
        </button>
        {applyWhatIf && variant.draft && (
          <button
            type="button"
            className="btn-ghost"
            disabled={streaming || applied}
            onClick={() => {
              applyWhatIf(resultId);
              setApplied(true);
            }}
          >
            {applied ? "Applied to your scenario" : "Apply to my scenario"}
          </button>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------

export function SuggestionChips({
  suggestions,
  disabled,
}: {
  suggestions: string[];
  disabled?: boolean;
}) {
  const { send } = useConversationContext();
  return (
    <div className="flex flex-wrap gap-2" data-testid="suggestions">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => {
            posthog.capture("suggestion_tapped");
            send(s);
          }}
          className="min-h-[40px] rounded-full border border-border bg-white px-4 py-2 text-left text-[14.5px] font-medium text-text-primary transition-colors duration-200 hover:border-pine-mid hover:text-pine disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
