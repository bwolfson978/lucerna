"use client";

import { useState } from "react";
import { BRACKET_COLORS, CHART_COLORS } from "./colors";
import { formatAxisCurrency, formatCurrency } from "./format";
import { ChartBody, Legend, W, labelEvery, useGrow, type TooltipState } from "./charts/primitives";

/** How conversions fill the tax brackets each year (backend app/tools/views.py). */
export interface BracketFillData {
  years: {
    year: number;
    /** Taxable income other than the conversion. */
    income: number;
    conversion: number;
    /** The conversion, split by the bracket each part lands in, lowest first. */
    segments: { rate: number; amount: number }[];
  }[];
  /** Federal brackets in taxable income, lowest first; `max` is null for the top one. */
  brackets?: { rate: number; min: number; max: number | null }[];
}

function bracketColor(rate: number): string {
  return BRACKET_COLORS[rate.toFixed(2)] ?? CHART_COLORS.conversion;
}

function rateLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const H = 280;
const TOP = 12;
const BOTTOM = 28;
const LEFT = 50;
const RIGHT = 46;
/** Smallest vertical gap between rate labels before they are nudged apart. */
const LABEL_GAP = 15;
/** Keep a little room above the tallest bar before the next bracket line. */
const HEADROOM = 1.08;

/** Top of the plot: the first bracket line comfortably above the tallest bar, and at
 * least the top of the 12% bracket, so the next bracket up is always in view. */
function chartTop(maxTotal: number, brackets: NonNullable<BracketFillData["brackets"]>): number {
  const floor = brackets[1]?.max ?? 0;
  const target = Math.max(maxTotal * HEADROOM, floor);
  const next = brackets.find((b) => b.max != null && b.max >= target);
  return next?.max ?? Math.max(1, maxTotal * 1.25);
}

/** Stacked bars per year, other income then the conversion, against the bracket lines,
 * with the space left in each bracket shown above the bar. */
export function BracketFillChart({
  data,
  framed = true,
}: {
  data: BracketFillData;
  /** Draw its own card. Off when embedded in another card. */
  framed?: boolean;
}) {
  const { ref, grown, animate } = useGrow();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const stacks = data.years;
  const brackets = data.brackets ?? [];
  const totals = stacks.map((s) => s.income + s.conversion);
  const maxTotal = Math.max(1, ...totals);
  const max = brackets.length ? chartTop(maxTotal, brackets) : maxTotal;
  const plotW = W - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const base = H - BOTTOM;
  const y = (v: number) => base - (plotH * Math.min(v, max)) / max;
  const slot = plotW / Math.max(1, stacks.length);
  const barW = Math.max(6, Math.min(48, slot * 0.72));
  const every = labelEvery(stacks.length);
  const ticks = [0, max / 2, max];
  const lines = brackets.filter((b) => b.max != null && b.max <= max);

  // Rate labels sit on their lines, nudged down when lines crowd together.
  const labelY: number[] = [];
  let last = -Infinity;
  for (let i = lines.length - 1; i >= 0; i--) {
    last = Math.max(y(lines[i].max!) + 4, last + LABEL_GAP);
    labelY[i] = last;
  }

  return (
    <div
      ref={ref}
      className={framed ? "card flex flex-col gap-3" : "flex flex-col gap-3"}
      data-ui="bracket-fill"
    >
      <ChartBody
        title={framed ? "How conversions fill your tax brackets" : undefined}
        tip={tip}
        legend={
          <Legend
            items={[
              { label: "Other taxable income", color: CHART_COLORS.income },
              { label: "Roth conversion", color: CHART_COLORS.conversion },
              ...(brackets.length
                ? [{ label: "Space left in bracket", color: CHART_COLORS.remainingStroke }]
                : []),
            ]}
          />
        }
        footer={
          <p className="text-caption text-text-tertiary">
            Taxable income each year after the standard deduction. Conversions stop where the next
            bracket would cost more than it saves.
          </p>
        }
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label="Taxable income and conversions by year, against the tax brackets"
          onPointerLeave={() => setTip(null)}
        >
          {ticks.map((t) => (
            <text
              key={t}
              x={LEFT - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-text-tertiary font-mono text-[12px]"
            >
              {formatAxisCurrency(t)}
            </text>
          ))}
          <line x1={LEFT} x2={W - RIGHT} y1={base} y2={base} stroke="rgba(20,20,20,0.12)" />
          {lines.map((b, i) => (
            <g key={b.rate}>
              <line
                x1={LEFT}
                x2={W - RIGHT}
                y1={y(b.max!)}
                y2={y(b.max!)}
                stroke={bracketColor(b.rate)}
                strokeDasharray="5 4"
                opacity={0.6}
              />
              <text
                x={W - RIGHT + 6}
                y={labelY[i]}
                className="font-mono text-[13px] font-medium"
                fill={bracketColor(b.rate)}
              >
                {rateLabel(b.rate)}
              </text>
            </g>
          ))}
          {stacks.map((s, i) => {
            const x = LEFT + slot * i + (slot - barW) / 2;
            const total = totals[i];
            const topRate = s.segments.length ? s.segments[s.segments.length - 1].rate : null;
            const tax = s.segments.reduce((sum, g) => sum + g.rate * g.amount, 0);
            const remaining = brackets
              .map((b) => ({
                key: b.rate,
                from: Math.max(b.min, total),
                to: Math.min(b.max ?? max, max),
              }))
              .filter((r) => y(r.from) - y(r.to) > 1);
            const incomeH = s.income > 0.5 ? Math.max(1, base - y(s.income)) : 0;
            const convH = s.conversion > 0.5 ? Math.max(2, y(s.income) - y(total)) : 0;
            const show = () =>
              setTip({
                x: ((x + barW / 2) / W) * 100,
                title: String(s.year),
                lines: [
                  {
                    label: "converted",
                    value: formatCurrency(s.conversion),
                    color: CHART_COLORS.conversion,
                  },
                  {
                    label: "other taxable income",
                    value: formatCurrency(s.income),
                    color: CHART_COLORS.income,
                  },
                  ...(topRate != null
                    ? [
                        { label: "tax on the conversion", value: formatCurrency(tax) },
                        { label: "top bracket used", value: rateLabel(topRate) },
                      ]
                    : []),
                ],
              });
            return (
              <g
                key={s.year}
                tabIndex={0}
                role="img"
                aria-label={`${s.year}: converted ${formatCurrency(s.conversion)}`}
                onPointerEnter={show}
                onPointerMove={show}
                onFocus={show}
                onBlur={() => setTip(null)}
                className="outline-none"
              >
                <rect x={LEFT + slot * i} y={TOP} width={slot} height={plotH} fill="transparent" />
                {remaining.map((r) => (
                  <rect
                    key={r.key}
                    x={x}
                    y={y(r.to)}
                    width={barW}
                    height={y(r.from) - y(r.to)}
                    rx={2}
                    fill={CHART_COLORS.remaining}
                    stroke={CHART_COLORS.remainingStroke}
                    strokeWidth={0.75}
                  />
                ))}
                <g
                  style={{
                    transform: grown ? "scaleY(1)" : "scaleY(0)",
                    transformOrigin: `0 ${base}px`,
                    transition: animate
                      ? `transform 600ms cubic-bezier(0.2,0.7,0.2,1) ${i * 35}ms`
                      : undefined,
                  }}
                >
                  {incomeH > 0 && (
                    <rect
                      x={x}
                      y={base - incomeH}
                      width={barW}
                      height={incomeH}
                      rx={2}
                      fill={CHART_COLORS.income}
                    />
                  )}
                  {convH > 0 && (
                    <rect
                      x={x}
                      y={base - incomeH - convH}
                      width={barW}
                      height={convH}
                      rx={2}
                      fill={CHART_COLORS.conversion}
                    />
                  )}
                </g>
                {i % every === 0 && (
                  <text
                    x={x + barW / 2}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-text-tertiary font-mono text-[12px]"
                  >
                    {s.year}
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
