"use client";

import type { YearlyDetail, LifeEvent } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";
import { LIFE_EVENT_LABELS } from "@/lib/utils/constants";
import { Tooltip } from "@/components/common/Tooltip";
import { useRef } from "react";

interface YearOverride {
  income?: number;
  life_event?: LifeEvent;
}

interface TransposedDetailTableProps {
  details: YearlyDetail[];
  years: { year: number; age: number }[];
  incomes: number[];
  lifeEvents: LifeEvent[];
  overrides: Map<number, YearOverride>;
  onIncomeChange: (yearIndex: number, income: number) => void;
  onLifeEventChange: (yearIndex: number, event: LifeEvent) => void;
}

const LIFE_EVENT_OPTIONS: LifeEvent[] = [
  "none",
  "grad_school",
  "sabbatical",
  "startup",
  "career_change",
  "part_time",
  "early_retirement",
  "parental_leave",
  "back_to_work",
  "layoff",
];

export function TransposedDetailTable({
  details,
  years,
  incomes,
  lifeEvents,
  overrides,
  onIncomeChange,
  onLifeEventChange,
}: TransposedDetailTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const colWidth = 58; // Matches bar width + gap in BracketChart

  return (
    <div className="flex text-body-sm">
      {/* Fixed row labels */}
      <div className="flex-shrink-0 w-[70px] flex flex-col border-r border-border">
        <div className="h-8 flex items-center text-text-tertiary text-[10px] font-medium px-1">
          Life event
        </div>
        <div className="h-8 flex items-center text-text-tertiary text-[10px] font-medium px-1">
          Earned Income
        </div>
        <div className="h-8 flex items-center text-text-tertiary text-[10px] font-medium px-1">
          Conversion
        </div>
        <div className="h-8 flex items-center text-text-tertiary text-[10px] font-medium px-1">
          Tax cost
        </div>
        <div className="h-8 flex items-center gap-0.5 text-text-tertiary text-[10px] font-medium px-1">
          Eff. rate
          <Tooltip content="The average tax rate on your total conversion amount — total tax paid divided by total converted." />
        </div>
        <div className="h-8 flex items-center gap-0.5 text-text-tertiary text-[10px] font-medium px-1">
          Marginal
          <Tooltip content="The tax rate on the next dollar converted — determines whether converting more would still be beneficial." />
        </div>
      </div>

      {/* Scrollable columns (synced with chart scroll) */}
      <div className="scroll-fade flex-1 min-w-0">
      <div ref={scrollRef} className="overflow-x-auto bracket-chart-scroll">
        <div className="flex" style={{ width: `${years.length * colWidth}px` }}>
          {years.map((yearInfo, i) => {
            const detail = details[i];
            const hasOverride = overrides.has(i);
            const effectiveIncome = overrides.get(i)?.income ?? incomes[i];
            const effectiveEvent =
              overrides.get(i)?.life_event ?? lifeEvents[i];

            return (
              <div
                key={yearInfo.year}
                className="flex flex-col"
                style={{ width: `${colWidth}px` }}
              >
                {/* Life event */}
                <div className="h-8 flex items-center justify-center">
                  <select
                    value={effectiveEvent}
                    onChange={(e) =>
                      onLifeEventChange(i, e.target.value as LifeEvent)
                    }
                    className={`w-full text-[9px] bg-transparent border-0 p-0 text-center cursor-pointer focus:outline-none ${
                      hasOverride && overrides.get(i)?.life_event
                        ? "text-accent font-medium"
                        : "text-text-tertiary"
                    }`}
                    title={LIFE_EVENT_LABELS[effectiveEvent]}
                  >
                    {LIFE_EVENT_OPTIONS.map((evt) => (
                      <option key={evt} value={evt}>
                        {LIFE_EVENT_LABELS[evt]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Income (editable) */}
                <div className="h-8 flex items-center justify-center">
                  <input
                    type="number"
                    value={effectiveIncome}
                    onChange={(e) =>
                      onIncomeChange(i, Number(e.target.value))
                    }
                    className={`w-full text-[10px] text-center bg-transparent border-0 p-0 focus:outline-none focus:bg-accent/5 rounded ${
                      hasOverride && overrides.get(i)?.income !== undefined
                        ? "text-accent font-medium"
                        : "text-text-primary"
                    }`}
                    style={{ fontFamily: "'Manrope', system-ui" }}
                  />
                </div>

                {/* Conversion (read-only) */}
                <div
                  className="h-8 flex items-center justify-center text-[10px] text-accent"
                  style={{ fontFamily: "'Manrope', system-ui" }}
                >
                  {detail ? formatCurrency(detail.conversion) : "—"}
                </div>

                {/* Tax cost */}
                <div
                  className="h-8 flex items-center justify-center text-[10px] text-text-primary"
                  style={{ fontFamily: "'Manrope', system-ui" }}
                >
                  {detail ? formatCurrency(detail.tax_cost) : "—"}
                </div>

                {/* Effective rate */}
                <div
                  className="h-8 flex items-center justify-center text-[10px] text-text-primary"
                  style={{ fontFamily: "'Manrope', system-ui" }}
                >
                  {detail ? formatPercent(detail.effective_rate) : "—"}
                </div>

                {/* Marginal bracket */}
                <div
                  className="h-8 flex items-center justify-center text-[10px] text-text-primary"
                  style={{ fontFamily: "'Manrope', system-ui" }}
                >
                  {detail
                    ? typeof detail.marginal_bracket === "number"
                      ? formatPercent(detail.marginal_bracket)
                      : detail.marginal_bracket
                    : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
