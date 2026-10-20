"use client";

import { useRef } from "react";
import { useContainerWidth } from "@lucerna/ui";
import type { PlanYear } from "@/lib/types";
import { formatAxisCurrency, formatCurrency } from "@/lib/utils/formatting";
import type { IncomeKind, IncomeSource } from "@/lib/utils/timeline";
import { SOURCE_COLORS } from "@/components/calculator/IncomeSourcesEditor";

interface IncomePreviewChartProps {
  timeline: PlanYear[];
  sources: IncomeSource[];
  age: number;
  /** Age withdrawals from the accounts begin. */
  retirementAge: number;
  /** Total household spending once withdrawals begin. Null: 4% rule (not drawn). */
  spending: number | null;
  /** Yearly inflation, percent: a pension's fixed amount shrinks by it in today's dollars. */
  inflationPct?: number;
}

type Segment = "base" | IncomeKind | "accounts";
const STACK: Segment[] = ["base", "social_security", "pension", "other", "accounts"];
const LEGEND: Record<Segment, string> = {
  base: "Income from work",
  social_security: "Social Security",
  pension: "Pension",
  other: "Other income",
  accounts: "From your accounts",
};

/** Split each timeline year into its sources, plus what the accounts cover. */
export function previewBars(
  timeline: PlanYear[],
  sources: IncomeSource[],
  age: number,
  retirementAge: number,
  spending: number | null,
  horizon: number,
  inflationPct = 0
) {
  return timeline.map((row, i) => {
    const yearAge = age + i;
    const parts: Record<Segment, number> = {
      base: 0,
      social_security: 0,
      pension: 0,
      other: 0,
      accounts: 0,
    };
    let fromSources = 0;
    for (const src of sources) {
      if (src.start_age <= yearAge && yearAge <= (src.end_age ?? horizon)) {
        // Same amounts as generateTimeline: a pension is fixed, so it shrinks by inflation
        const amount =
          src.kind === "pension" ? src.amount / Math.pow(1 + inflationPct / 100, i) : src.amount;
        const share = Math.min(amount, Math.max(0, row.gross_income - fromSources));
        parts[src.kind] += share;
        fromSources += share;
      }
    }
    parts.base = Math.max(0, row.gross_income - fromSources);
    if (spending && yearAge >= retirementAge) {
      parts.accounts = Math.max(0, spending - row.gross_income);
    }
    return { age: yearAge, year: row.year, income: row.gross_income, parts };
  });
}

const H = 200;
const PAD = { left: 44, right: 4, top: 8, bottom: 22 };

/** Live preview of the year-by-year income the form's inputs produce. */
export function IncomePreviewChart({
  timeline,
  sources,
  age,
  retirementAge,
  spending,
  inflationPct = 0,
}: IncomePreviewChartProps) {
  const ref = useRef<HTMLElement>(null);
  const W = Math.max(280, useContainerWidth(ref) ?? 600);
  if (timeline.length === 0) return null;
  const horizon = age + timeline.length - 1;
  const bars = previewBars(timeline, sources, age, retirementAge, spending, horizon, inflationPct);
  const used = STACK.filter((seg) => bars.some((b) => b.parts[seg] > 0));
  const peak = Math.max(1, ...bars.map((b) => STACK.reduce((sum, seg) => sum + b.parts[seg], 0)));
  const step = niceStep(peak / 4);
  const top = Math.ceil(peak / step) * step;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / bars.length;
  const barW = Math.max(1, slot * 0.72);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = slot >= 28 ? 1 : slot >= 14 ? 2 : 5;

  return (
    <figure ref={ref} className="flex flex-col gap-tight">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
        {used.map((seg) => (
          <span key={seg} className="flex items-center gap-1.5">
            <i
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: SOURCE_COLORS[seg] }}
            />
            {LEGEND[seg]}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Income each year from age ${age} to ${horizon}`}
        className="overflow-visible"
      >
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="#e4e0d6"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-text-tertiary font-mono"
              fontSize={11}
            >
              {formatAxisCurrency(v)}
            </text>
          </g>
        ))}
        {bars.map((bar, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          let acc = 0;
          return (
            <g key={bar.year}>
              <title>
                {`Age ${bar.age} (${bar.year}): ${formatCurrency(bar.income)} income` +
                  (bar.parts.accounts > 0
                    ? `, ${formatCurrency(bar.parts.accounts)} from your accounts`
                    : "")}
              </title>
              {STACK.map((seg) => {
                const v = bar.parts[seg];
                if (v <= 0) return null;
                const rect = (
                  <rect
                    key={seg}
                    x={x}
                    y={y(acc + v)}
                    width={barW}
                    height={y(acc) - y(acc + v)}
                    fill={SOURCE_COLORS[seg]}
                  />
                );
                acc += v;
                return rect;
              })}
              {(i === bars.length - 1 ||
                (i % labelEvery === 0 && bars.length - 1 - i >= Math.ceil(labelEvery * 0.6))) && (
                <text
                  x={x + barW / 2}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-text-tertiary font-mono"
                  fontSize={11}
                >
                  {bar.age}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}
