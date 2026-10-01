"use client";

import { useState } from "react";
import { CHART_COLORS } from "./colors";
import { formatCurrency } from "./format";
import {
  ChartBody,
  GAP,
  Legend,
  W,
  labelEvery,
  useGrow,
  type TooltipState,
} from "./charts/primitives";
import { Stat } from "./Stat";

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

const H = 90;

export function CompareBars({
  years,
  variantLabel,
}: {
  years: ScenarioCompareData["conversions_by_year"];
  variantLabel: string;
}) {
  const { ref, grown, animate } = useGrow();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const max = Math.max(1, ...years.map((y) => Math.max(y.current, y.what_if)));
  const slot = W / Math.max(1, years.length);
  const pairW = Math.max(6, Math.min(36, slot - 6));
  const barW = (pairW - GAP) / 2;
  const every = labelEvery(years.length);
  const colors = { base: CHART_COLORS.income, variant: CHART_COLORS.conversion };

  return (
    <div ref={ref} className="flex flex-col gap-2">
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
        <svg
          viewBox={`0 0 ${W} ${H + 18}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Conversions by year, your scenario compared with the what-if"
          onPointerLeave={() => setTip(null)}
        >
          <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" />
          {years.map((yr, i) => {
            const x = slot * i + (slot - pairW) / 2;
            const show = () =>
              setTip({
                x: ((x + pairW / 2) / W) * 100,
                title: String(yr.year),
                lines: [
                  { label: variantLabel, value: formatCurrency(yr.what_if), color: colors.variant },
                  { label: "your scenario", value: formatCurrency(yr.current), color: colors.base },
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
                    y={H + 15}
                    textAnchor="middle"
                    className="fill-text-tertiary font-mono text-[11px]"
                  >
                    {yr.year}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Savings now" value={formatCurrency(savings.current)} />
        <Stat label="With this change" value={formatCurrency(savings.what_if)} />
        <div className="col-span-2 sm:col-span-1">
          <Stat
            label="Difference"
            value={`${diff >= 0 ? "+" : "-"}${formatCurrency(Math.abs(diff))}`}
            tone={diff >= 0 ? "positive" : "negative"}
          />
        </div>
      </div>
      <CompareBars years={data.conversions_by_year} variantLabel={data.label} />
      {(onOpenFullResults || onApply) && (
        <div className="border-border pt-default flex flex-wrap gap-3 border-t">
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
