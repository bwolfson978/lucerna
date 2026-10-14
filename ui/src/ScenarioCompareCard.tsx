"use client";

import { cn } from "./cn";
import { CHART_COLORS, PALETTE } from "./colors";
import { formatAxisCurrency, formatCurrency } from "./format";
import { ChartBody, Legend, useGrow } from "./charts/primitives";

/** What conversions cost when they happen and what they avoid later, today's dollars. */
export interface TaxBreakdown {
  paid_now: number;
  avoided_later: number;
}

/**
 * A what-if next to the current scenario: the `structuredContent` that
 * `compare_roth_scenarios` returns (backend app/tools/core.py compare_results).
 */
export interface ScenarioCompareData {
  label: string;
  base_result_id: string;
  variant_result_id: string;
  estimated_lifetime_tax_savings: {
    current: number;
    what_if: number;
    difference: number;
  };
  /** Savings = avoided_later - paid_now. Missing from results saved before it existed. */
  tax_breakdown?: { current: TaxBreakdown; what_if: TaxBreakdown };
  conversions_by_year: { year: number; current: number; what_if: number }[];
}

export function isScenarioCompareData(value: unknown): value is ScenarioCompareData {
  const v = value as ScenarioCompareData | undefined;
  return (
    !!v &&
    typeof v.label === "string" &&
    typeof v.variant_result_id === "string" &&
    typeof v.estimated_lifetime_tax_savings?.difference === "number" &&
    Array.isArray(v.conversions_by_year)
  );
}

const COLORS = { paid: PALETTE.ember, avoided: CHART_COLORS.conversion };

/**
 * One row per scenario: tax paid on conversions to the left of the axis, tax they
 * avoid later to the right. The gap between the two is the savings, so a what-if
 * that changes the savings but not the schedule still looks different.
 */
export function PaidVsAvoided({
  rows,
}: {
  rows: { label: string; breakdown: TaxBreakdown; savings: number }[];
}) {
  const { ref, grown, animate } = useGrow();
  const maxPaid = Math.max(0, ...rows.map((r) => r.breakdown.paid_now));
  const maxAvoided = Math.max(0, ...rows.map((r) => r.breakdown.avoided_later));
  const total = maxPaid + maxAvoided;
  if (total <= 0) return null;
  // The axis sits where the biggest cost ends, so both sides share one scale.
  const axis = (maxPaid / total) * 100;
  const pct = (v: number) => (Math.max(0, v) / total) * 100;

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <ChartBody
        tip={null}
        legend={
          <Legend
            items={[
              { label: "Tax paid on conversions", color: COLORS.paid },
              { label: "Tax avoided later", color: COLORS.avoided },
            ]}
          />
        }
      >
        <div className="flex flex-col gap-3" data-ui="paid-vs-avoided">
          {rows.map((row, i) => {
            const { paid_now: paid, avoided_later: avoided } = row.breakdown;
            const grow = (origin: "left" | "right") => ({
              transform: grown ? "scaleX(1)" : "scaleX(0)",
              transformOrigin: origin,
              transition: animate ? `transform 500ms ease ${i * 80}ms` : undefined,
            });
            return (
              <div
                key={row.label}
                role="img"
                aria-label={`${row.label}: ${formatCurrency(paid)} paid on conversions, ${formatCurrency(avoided)} avoided later, ${formatCurrency(row.savings)} saved`}
                className="flex flex-col gap-1"
              >
                <div className="text-caption flex items-baseline justify-between gap-3">
                  <span className="text-text-secondary truncate">{row.label}</span>
                  <span className="font-data text-text-primary font-semibold whitespace-nowrap">
                    {formatCurrency(row.savings)} saved
                  </span>
                </div>
                <div className="px-12">
                  <div className="relative h-6">
                    <div
                      className="bg-text-tertiary absolute -top-1 -bottom-1 w-px"
                      style={{ left: `${axis}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 rounded-l-[3px]"
                      style={{
                        right: `${100 - axis}%`,
                        width: `${pct(paid)}%`,
                        background: COLORS.paid,
                        ...grow("right"),
                      }}
                    />
                    <span
                      className="font-data text-text-secondary absolute top-1/2 -translate-y-1/2 pr-1.5 text-[11px] whitespace-nowrap"
                      style={{ right: `${100 - axis + pct(paid)}%` }}
                    >
                      -{formatAxisCurrency(paid)}
                    </span>
                    <div
                      className="absolute top-0 bottom-0 rounded-r-[3px]"
                      style={{
                        left: `${axis}%`,
                        width: `${pct(avoided)}%`,
                        background: COLORS.avoided,
                        ...grow("left"),
                      }}
                    />
                    <span
                      className="font-data text-text-secondary absolute top-1/2 -translate-y-1/2 pl-1.5 text-[11px] whitespace-nowrap"
                      style={{ left: `${axis + pct(avoided)}%` }}
                    >
                      +{formatAxisCurrency(avoided)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ChartBody>
    </div>
  );
}

/** "$430,000 over 7 years", or "No conversions". */
function scheduleText(
  years: ScenarioCompareData["conversions_by_year"],
  key: "current" | "what_if"
) {
  const active = years.filter((y) => y[key] > 0);
  if (active.length === 0) return "no conversions";
  const sum = active.reduce((acc, y) => acc + y[key], 0);
  return `${formatCurrency(sum)} over ${active.length} ${active.length === 1 ? "year" : "years"}`;
}

interface ScenarioCompareCardProps {
  data: ScenarioCompareData;
  /** Open the full analysis of the what-if. Omit to hide the button. */
  onOpenFullResults?: () => void;
  /** Make the what-if the scenario. Omit to hide the button. */
  onApply?: () => void;
  applied?: boolean;
  applyDisabled?: boolean;
}

/** Estimated lifetime tax savings now vs. with a change, and where the difference comes from. */
export function ScenarioCompareCard({
  data,
  onOpenFullResults,
  onApply,
  applied = false,
  applyDisabled = false,
}: ScenarioCompareCardProps) {
  const savings = data.estimated_lifetime_tax_savings;
  const diff = savings.difference;
  return (
    <article className="card gap-comfortable flex flex-col" data-ui="scenario-compare">
      <div className="flex flex-col gap-1">
        <span className="eyebrow" data-ui="eyebrow">
          What if
        </span>
        <h3 className="text-text-primary font-serif text-[22px] leading-tight font-semibold">
          {data.label}
        </h3>
      </div>
      {/* The answer first: savings with the change, and how far that is from now. */}
      <div className="flex flex-col gap-1">
        <span className="metric-label">Estimated lifetime tax savings</span>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="metric-value-hero text-text-primary" data-ui="hero">
            {formatCurrency(savings.what_if)}
          </span>
          <span
            className={cn(
              "font-data text-body-sm font-semibold",
              diff >= 0 ? "text-pine-mid" : "text-negative"
            )}
          >
            {`${diff >= 0 ? "+" : "\u2212"}${formatCurrency(Math.abs(diff))}`} vs. your scenario
          </span>
        </div>
        <span className="text-caption text-text-tertiary">
          Your scenario: {formatCurrency(savings.current)}, in today&apos;s dollars
        </span>
      </div>
      {data.tax_breakdown && (
        <PaidVsAvoided
          rows={[
            {
              label: "Your scenario",
              breakdown: data.tax_breakdown.current,
              savings: savings.current,
            },
            {
              label: data.label,
              breakdown: data.tax_breakdown.what_if,
              savings: savings.what_if,
            },
          ]}
        />
      )}
      <p className="text-body-sm text-text-secondary" data-ui="schedule-change">
        Converts {scheduleText(data.conversions_by_year, "current")} now,{" "}
        {scheduleText(data.conversions_by_year, "what_if")} with this change.
      </p>
      {(onOpenFullResults || onApply) && (
        <div className="border-border pt-default flex flex-col gap-3 border-t sm:flex-row">
          {onOpenFullResults && (
            <button type="button" className="btn-dark" onClick={onOpenFullResults} data-ui="cta">
              See full results
            </button>
          )}
          {onApply && (
            <button
              type="button"
              className="btn-ghost"
              disabled={applyDisabled || applied}
              onClick={onApply}
            >
              {applied ? "Applied to your scenario" : "Apply to my scenario"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
