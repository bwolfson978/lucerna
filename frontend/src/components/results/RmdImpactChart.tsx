"use client";

import { useRef, useMemo } from "react";
import type { OptimizationResult } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/common/MetricCard";
import { Tooltip } from "@/components/common/Tooltip";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { formatCurrency, formatAxisCurrency } from "@/lib/utils/formatting";
import { DATA_FONT_FAMILY } from "@/lib/utils/constants";

interface RmdImpactChartProps {
  result: OptimizationResult;
}

const TOTAL_HEIGHT = 200;
const TOP_PAD = 16;
const BOTTOM_PAD = 36;
const LEFT_PAD = 62;
const RIGHT_PAD = 16;
const PLOT_HEIGHT = TOTAL_HEIGHT - TOP_PAD - BOTTOM_PAD;

const COLOR_WITH = "#5EBD8C";
const COLOR_WITHOUT = "#B8B0D2";

type RmdPoint = { year: number; age: number; without: number; with: number };

function niceYMax(dataMax: number): number {
  if (dataMax <= 0) return 50000;
  const mag = Math.pow(10, Math.floor(Math.log10(dataMax)));
  const n = dataMax / mag;
  const nice = n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10;
  return nice * mag;
}

export function RmdImpactChart({ result }: RmdImpactChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);

  const withProj = result.rmd_projection;
  const withoutProj = result.rmd_projection_no_conversion;
  const summary = result.reasoning_trace?.rmd_summary;

  const points = useMemo((): RmdPoint[] => {
    if (!withoutProj || withoutProj.yearly_detail.length === 0) return [];
    const withMap = new Map((withProj?.yearly_detail ?? []).map((d) => [d.year, d.rmd_amount]));
    return withoutProj.yearly_detail.map((d) => ({
      year: d.year,
      age: d.age,
      without: d.rmd_amount,
      with: withMap.get(d.year) ?? 0,
    }));
  }, [withProj, withoutProj]);

  if (points.length === 0) return null;

  const typedPoints = points as RmdPoint[];
  const maxRmd = Math.max(...typedPoints.map((p: RmdPoint) => p.without), 1);
  const yMax = niceYMax(maxRmd);
  const Y_TICKS = 4;
  const yInterval = yMax / Y_TICKS;

  const plotWidth = (width ?? 400) - LEFT_PAD - RIGHT_PAD;
  const n = typedPoints.length;

  const toY = (v: number) => TOP_PAD + PLOT_HEIGHT * (1 - Math.min(v, yMax) / yMax);
  const toX = (i: number) => LEFT_PAD + (n <= 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth);

  const withoutPts = typedPoints
    .map((p: RmdPoint, i: number) => `${toX(i)},${toY(p.without)}`)
    .join(" ");
  const withPts = typedPoints.map((p: RmdPoint, i: number) => `${toX(i)},${toY(p.with)}`).join(" ");

  // Closed polygon for the shaded area between lines
  const fillPath = [
    `M ${typedPoints.map((p: RmdPoint, i: number) => `${toX(i)},${toY(p.without)}`).join(" L ")}`,
    `L ${[...typedPoints]
      .reverse()
      .map((p: RmdPoint, i: number) => `${toX(n - 1 - i)},${toY(p.with)}`)
      .join(" L ")}`,
    "Z",
  ].join(" ");

  // Show a label roughly every 2-3 years; always include first and last
  const labelStep = n <= 8 ? 2 : 3;
  const xLabelIndices = new Set<number>([0, n - 1]);
  for (let i = 0; i < n; i += labelStep) xLabelIndices.add(i);

  const peakWithout = withoutProj!.peak_rmd_amount;
  const peakWith = withProj?.peak_rmd_amount ?? 0;
  const peakReduction = peakWithout - peakWith;
  const peakPct = peakWithout > 0 ? Math.round((peakReduction / peakWithout) * 100) : 0;
  const peakAgeWithout = withoutProj!.yearly_detail.find((d) => d.rmd_amount === peakWithout)?.age;

  return (
    <div className="flex flex-col gap-default">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">Required withdrawal projection</h3>
        <Tooltip content="Required Minimum Distributions (RMDs) are mandatory annual withdrawals from traditional IRA/401(k) accounts starting at age 73. Converting to Roth now reduces the balance subject to RMDs, lowering forced taxable withdrawals later." />
      </div>

      <div className="grid grid-cols-2 gap-tight sm:grid-cols-3 sm:gap-default">
        <MetricCard
          label="Peak withdrawal without conversions"
          value={formatCurrency(peakWithout)}
          delta={peakAgeWithout ? `at age ${peakAgeWithout}` : undefined}
          deltaType="neutral"
        />
        <MetricCard
          label="Peak withdrawal with this plan"
          value={formatCurrency(peakWith)}
          delta={peakReduction > 0 ? `${peakPct}% lower` : "no change"}
          deltaType={peakReduction > 0 ? "positive" : "neutral"}
          valueClassName={peakReduction > 0 ? "text-optimal" : undefined}
        />
        {summary && summary.rmd_tax_savings > 0 && (
          <MetricCard
            label="Tax savings on withdrawals"
            value={formatCurrency(summary.rmd_tax_savings)}
            delta="from reduced mandatory distributions"
            deltaType="positive"
            valueClassName="text-optimal"
          />
        )}
      </div>

      <Card className="flex flex-col gap-4 overflow-hidden">
        <div ref={containerRef} className="w-full">
          {width !== undefined && (
            <svg
              width={width}
              height={TOTAL_HEIGHT}
              aria-label="Required withdrawal comparison chart"
              style={{ fontFamily: DATA_FONT_FAMILY, display: "block" }}
            >
              {/* Y-axis grid + labels */}
              {Array.from({ length: Y_TICKS + 1 }, (_, i) => {
                const val = yInterval * i;
                const y = toY(val);
                return (
                  <g key={i}>
                    <line
                      x1={LEFT_PAD}
                      x2={LEFT_PAD + plotWidth}
                      y1={y}
                      y2={y}
                      stroke="rgba(255,255,255,0.07)"
                      strokeWidth={1}
                    />
                    <text x={LEFT_PAD - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#8B8A99">
                      {formatAxisCurrency(val)}
                    </text>
                  </g>
                );
              })}

              {/* Shaded reduction area */}
              <path d={fillPath} fill={COLOR_WITH} fillOpacity={0.12} />

              {/* Without-conversion line (dashed, muted) */}
              <polyline
                points={withoutPts}
                fill="none"
                stroke={COLOR_WITHOUT}
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeOpacity={0.75}
              />

              {/* With-conversion line (solid) */}
              <polyline points={withPts} fill="none" stroke={COLOR_WITH} strokeWidth={2.5} />

              {/* X-axis age labels */}
              {typedPoints.map((p: RmdPoint, i: number) => {
                if (!xLabelIndices.has(i)) return null;
                return (
                  <text
                    key={p.year}
                    x={toX(i)}
                    y={TOTAL_HEIGHT - 18}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#8B8A99"
                  >
                    Age {p.age}
                  </text>
                );
              })}
              {typedPoints.map((p: RmdPoint, i: number) => {
                if (!xLabelIndices.has(i)) return null;
                return (
                  <text
                    key={`yr-${p.year}`}
                    x={toX(i)}
                    y={TOTAL_HEIGHT - 5}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#5C5B6A"
                  >
                    {p.year}
                  </text>
                );
              })}
            </svg>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 pb-1 text-body-sm text-text-secondary">
          <span className="flex items-center gap-2">
            <svg width={24} height={12} aria-hidden>
              <line x1={0} y1={6} x2={24} y2={6} stroke={COLOR_WITH} strokeWidth={2.5} />
            </svg>
            With this plan
          </span>
          <span className="flex items-center gap-2">
            <svg width={24} height={12} aria-hidden>
              <line
                x1={0}
                y1={6}
                x2={24}
                y2={6}
                stroke={COLOR_WITHOUT}
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            </svg>
            Without conversions
          </span>
        </div>
      </Card>
    </div>
  );
}
