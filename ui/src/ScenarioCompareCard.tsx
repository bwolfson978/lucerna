"use client";

import { useRef, useState } from "react";
import { cn } from "./cn";
import { CHART_COLORS } from "./colors";
import { formatCurrency } from "./format";
import { useContainerWidth } from "./charts/hooks";
import { ChartBody, GAP, Legend, W, useGrow, type TooltipState } from "./charts/primitives";

/**
 * A what-if next to the current scenario: the `structuredContent` that
 * `compare_roth_scenarios` returns (backend app/tools/core.py compare_results).
 */
export interface ScenarioCompareData {
  label: string;
  base_result_id: string;
  variant_result_id: string;
  estimated_lifetime_tax_savings: { current: number; what_if: number; difference: number };
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

const H = 112;
/** Below this slot width, years print as '26. */
const SHORT_YEAR_SLOT = 40;

export function CompareBars({
  years,
  variantLabel,
}: {
  years: ScenarioCompareData["conversions_by_year"];
  variantLabel: string;
}) {
  const { ref, grown, animate } = useGrow();
  const plotRef = useRef<HTMLDivElement>(null);
  // Drawn at the container's real width so labels keep their size on every screen.
  const width = useContainerWidth(plotRef) ?? W;
  const [tip, setTip] = useState<TooltipState | null>(null);
  const max = Math.max(1, ...years.map((y) => Math.max(y.current, y.what_if)));
  const slot = width / Math.max(1, years.length);
  const pairW = Math.max(6, Math.min(40, slot - 8));
  const barW = (pairW - GAP) / 2;
  const every = slot < 22 ? 2 : 1;
  const shortYears = slot < SHORT_YEAR_SLOT;
  const colors = { base: CHART_COLORS.income, variant: CHART_COLORS.conversion };

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <ChartBody
        tip={tip}
        legend={
          <Legend
            items={[
              { label: "Your scenario", color: colors.base },
              { label: variantLabel, color: colors.variant },
            ]}
          />
        }
      >
        <div ref={plotRef}>
          <svg
            width={width}
            height={H + 22}
            className="block"
            role="img"
            aria-label="Conversions by year, your scenario compared with the what-if"
            onPointerLeave={() => setTip(null)}
          >
            <line x1={0} x2={width} y1={H} y2={H} className="stroke-border" />
            {years.map((yr, i) => {
              const x = slot * i + (slot - pairW) / 2;
              const show = () =>
                setTip({
                  x: ((x + pairW / 2) / width) * 100,
                  title: String(yr.year),
                  lines: [
                    {
                      label: variantLabel,
                      value: formatCurrency(yr.what_if),
                      color: colors.variant,
                    },
                    {
                      label: "your scenario",
                      value: formatCurrency(yr.current),
                      color: colors.base,
                    },
                  ],
                });
              return (
                <g
                  key={yr.year}
                  tabIndex={0}
                  role="img"
                  aria-label={`${yr.year}: ${formatCurrency(yr.current)} now, ${formatCurrency(yr.what_if)} in the what-if`}
                  onPointerEnter={show}
                  onFocus={show}
                  onBlur={() => setTip(null)}
                  className="outline-none"
                >
                  <rect x={slot * i} y={0} width={slot} height={H} fill="transparent" />
                  {[
                    { v: yr.current, dx: 0, color: colors.base },
                    { v: yr.what_if, dx: barW + GAP, color: colors.variant },
                  ].map((bar) => {
                    const h = Math.max(bar.v > 0 ? 2 : 0, (H - 4) * (bar.v / max));
                    return (
                      <rect
                        key={bar.dx}
                        x={x + bar.dx}
                        y={H - h}
                        width={barW}
                        height={h}
                        rx={2}
                        fill={bar.color}
                        style={{
                          transform: grown ? "scaleY(1)" : "scaleY(0)",
                          transformOrigin: `0 ${H}px`,
                          transition: animate ? `transform 500ms ease ${i * 25}ms` : undefined,
                        }}
                      />
                    );
                  })}
                  {i % every === 0 && (
                    <text
                      x={x + pairW / 2}
                      y={H + 16}
                      textAnchor="middle"
                      className="fill-text-tertiary text-[11px]"
                      fontFamily="'Inter', system-ui"
                    >
                      {shortYears ? `\u2019${String(yr.year).slice(-2)}` : yr.year}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </ChartBody>
    </div>
  );
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

/** Estimated lifetime tax savings now vs. with a change, and conversions by year. */
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
      <CompareBars years={data.conversions_by_year} variantLabel={data.label} />
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
