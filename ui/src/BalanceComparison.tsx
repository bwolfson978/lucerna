"use client";

import { useState, type PointerEvent } from "react";
import { CHART_COLORS, PALETTE } from "./colors";
import { formatAxisCurrency, formatCompactCurrency, formatCurrency, formatSavings } from "./format";
import { ChartBody, Legend, W, useGrow, type TooltipState } from "./charts/primitives";
import { Stat } from "./Stat";

/** Traditional balance with and without conversions (backend app/tools/views.py). */
export interface BalanceComparisonData {
  roth_at_retirement: number;
  peak_rmd_with: number | null;
  peak_rmd_without: number | null;
  /** Estimated lifetime tax savings' after-tax wealth effect, today's dollars. */
  after_tax_wealth_change: number;
  points: { age: number; year: number; with: number; without: number }[];
}

const H = 180;
const LEFT = 50;
const BOTTOM = 24;

export function BalanceLines({ points }: { points: BalanceComparisonData["points"] }) {
  const { ref, grown, animate } = useGrow();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const plotW = W - LEFT - 10;
  const max = Math.max(1, ...points.map((p) => Math.max(p.with, p.without)));
  const x = (i: number) => LEFT + (plotW * i) / (points.length - 1);
  const y = (v: number) => H - BOTTOM - ((H - BOTTOM - 10) * v) / max;
  const path = (key: "with" | "without") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`)
      .join(" ");
  const every = Math.max(1, Math.ceil(points.length / 6));
  const colors = { with: CHART_COLORS.conversion, without: PALETTE.muted };

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - LEFT) / plotW) * (points.length - 1));
    const idx = Math.min(points.length - 1, Math.max(0, i));
    const p = points[idx];
    setHover(idx);
    setTip({
      x: (x(idx) / W) * 100,
      title: `Age ${p.age} (${p.year})`,
      lines: [
        { label: "with conversions", value: formatCurrency(p.with), color: colors.with },
        { label: "without", value: formatCurrency(p.without), color: colors.without },
      ],
    });
  }

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <ChartBody
        tip={tip}
        legend={
          <Legend
            items={[
              { label: "With conversions", color: colors.with, line: true },
              { label: "Without conversions", color: colors.without, line: true },
            ]}
          />
        }
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y"
          role="img"
          aria-label={`Traditional balance from age ${points[0].age} to ${points[points.length - 1].age}, with and without conversions`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => {
            setHover(null);
            setTip(null);
          }}
        >
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={W - 10} y1={y(t)} y2={y(t)} stroke="rgba(20,20,20,0.06)" />
              <text
                x={LEFT - 6}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-text-tertiary font-ui text-[11px]"
              >
                {formatAxisCurrency(t)}
              </text>
            </g>
          ))}
          {(["without", "with"] as const).map((key) => (
            <path
              key={key}
              d={path(key)}
              fill="none"
              stroke={colors[key]}
              strokeWidth={2}
              {...(key === "with"
                ? {
                    pathLength: 1,
                    style: {
                      strokeDasharray: 1,
                      strokeDashoffset: grown ? 0 : 1,
                      transition: animate
                        ? "stroke-dashoffset 900ms cubic-bezier(0.2,0.7,0.2,1)"
                        : undefined,
                    },
                  }
                : { strokeDasharray: "5 4" })}
            />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={8} y2={H - BOTTOM} stroke={PALETTE.stone} />
              <circle
                cx={x(hover)}
                cy={y(points[hover].with)}
                r={4}
                fill={colors.with}
                stroke="#fff"
                strokeWidth={2}
              />
              <circle
                cx={x(hover)}
                cy={y(points[hover].without)}
                r={4}
                fill={colors.without}
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          )}
          {points.map((p, i) =>
            i % every === 0 ? (
              <text
                key={p.age}
                x={x(i)}
                y={H - 6}
                textAnchor="middle"
                className="fill-text-tertiary font-mono text-[11px]"
              >
                {p.age}
              </text>
            ) : null
          )}
        </svg>
      </ChartBody>
    </div>
  );
}

/** Roth at retirement, largest RMD and wealth effect, over the balance chart. */
export function BalanceComparison({
  data,
  framed = true,
}: {
  data: BalanceComparisonData;
  /** Draw its own card. Off when embedded in another card. */
  framed?: boolean;
}) {
  const { peak_rmd_with: peakWith, peak_rmd_without: peakWithout } = data;
  return (
    <div
      className={framed ? "card gap-comfortable flex flex-col" : "gap-comfortable flex flex-col"}
      data-ui="balance-comparison"
    >
      {framed && <h3 className="text-h3 text-text-primary">Your traditional balance over time</h3>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Roth at retirement" value={formatCompactCurrency(data.roth_at_retirement)} />
        {peakWith != null && peakWithout != null && (
          <Stat
            label="Largest RMD"
            value={`${formatCompactCurrency(peakWith)} vs ${formatCompactCurrency(peakWithout)}`}
          />
        )}
        <Stat label="After-tax wealth" value={formatSavings(data.after_tax_wealth_change)} />
      </div>
      <BalanceLines points={data.points} />
      <p className="text-caption text-text-tertiary">
        Traditional balances are taxed when withdrawn, and required minimum distributions grow with
        them. Roth balances are not taxed. Amounts are projected, not in today&apos;s dollars.
      </p>
    </div>
  );
}
