"use client";

import { useState } from "react";
import { BRACKET_COLORS, CHART_COLORS } from "./colors";
import { formatAxisCurrency, formatCurrency } from "./format";
import {
  ChartBody,
  GAP,
  Legend,
  W,
  labelEvery,
  useGrow,
  type TooltipState,
} from "./charts/primitives";

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
}

function bracketColor(rate: number): string {
  return BRACKET_COLORS[rate.toFixed(2)] ?? CHART_COLORS.conversion;
}

function rateLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const H = 210;
const TOP = 12;
const BOTTOM = 26;
const LEFT = 44;

/** Stacked bars per year: other income, then the conversion colored by bracket. */
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
  const plotW = W - LEFT - 8;
  const max = Math.max(
    1,
    ...stacks.map((s) => s.income + s.segments.reduce((a, b) => a + b.amount, 0))
  );
  const y = (v: number) => ((H - TOP - BOTTOM) * v) / max;
  const slot = plotW / Math.max(1, stacks.length);
  const barW = Math.max(6, Math.min(30, slot - 6));
  const every = labelEvery(stacks.length);
  const ticks = [0, max / 2, max];
  const usedRates = Array.from(
    new Set(stacks.flatMap((s) => s.segments.map((g) => g.rate)))
  ).sort();

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
              ...usedRates.map((r) => ({
                label: `Converted at ${rateLabel(r)}`,
                color: bracketColor(r),
              })),
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
          aria-label="Taxable income and conversions by year, colored by tax bracket"
          onPointerLeave={() => setTip(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={LEFT}
                x2={W - 8}
                y1={H - BOTTOM - y(t)}
                y2={H - BOTTOM - y(t)}
                stroke="rgba(20,20,20,0.06)"
              />
              <text
                x={LEFT - 6}
                y={H - BOTTOM - y(t) + 4}
                textAnchor="end"
                className="fill-text-tertiary font-ui text-[11px]"
              >
                {formatAxisCurrency(t)}
              </text>
            </g>
          ))}
          {stacks.map((s, i) => {
            const x = LEFT + slot * i + (slot - barW) / 2;
            const topRate = s.segments.length ? s.segments[s.segments.length - 1].rate : null;
            let base = H - BOTTOM;
            const parts = [
              {
                key: "income",
                amount: s.income,
                color: CHART_COLORS.income,
                rate: null as number | null,
              },
              ...s.segments.map((g) => ({
                key: `r${g.rate}`,
                amount: g.amount,
                color: bracketColor(g.rate),
                rate: g.rate,
              })),
            ].filter((p) => p.amount > 0.5);
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
                    ? [{ label: "top bracket used", value: rateLabel(topRate) }]
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
                <rect
                  x={LEFT + slot * i}
                  y={TOP}
                  width={slot}
                  height={H - TOP - BOTTOM}
                  fill="transparent"
                />
                <g
                  style={{
                    transform: grown ? "scaleY(1)" : "scaleY(0)",
                    transformOrigin: `0 ${H - BOTTOM}px`,
                    transition: animate
                      ? `transform 600ms cubic-bezier(0.2,0.7,0.2,1) ${i * 35}ms`
                      : undefined,
                  }}
                >
                  {parts.map((p, j) => {
                    const h = Math.max(1, y(p.amount) - (j > 0 ? GAP : 0));
                    base -= y(p.amount);
                    return (
                      <rect
                        key={p.key}
                        x={x}
                        y={base}
                        width={barW}
                        height={h}
                        rx={j === parts.length - 1 ? 3 : 0}
                        fill={p.color}
                        opacity={p.rate == null ? 0.75 : 1}
                      />
                    );
                  })}
                </g>
                {i % every === 0 && (
                  <text
                    x={x + barW / 2}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-text-tertiary font-mono text-[11px]"
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
