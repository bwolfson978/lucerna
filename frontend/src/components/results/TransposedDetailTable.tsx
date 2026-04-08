"use client";

import type { YearlyDetail } from "@/lib/types";
import { formatTableCurrency } from "@/lib/utils/formatting";

import { useMemo, useRef, useState, type RefObject } from "react";
import { useScrollFade } from "@/hooks/useScrollFade";

interface TransposedDetailTableProps {
  details: YearlyDetail[];
  years: { year: number; age: number }[];
  incomes: number[];
  overrides: Map<number, { income?: number }>;
  onIncomeChange: (yearIndex: number, income: number) => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
  colWidth?: number;
  /** Width of fixed left area in the chart (vertical label + y-axis) */
  leftOffset?: number;
  /** Width of fixed right area in the chart (bracket labels + vertical label) */
  rightOffset?: number;
  /** Show the editable income row (calculator mode) */
  showIncomeRow?: boolean;
}

function CompactCurrencyCell({
  value,
  onChange,
  highlighted,
  maxChars,
}: {
  value: number;
  onChange: (val: number) => void;
  highlighted: boolean;
  maxChars?: number;
}) {
  const [focused, setFocused] = useState(false);
  const display = focused
    ? value === 0 ? "" : String(value)
    : formatTableCurrency(value, maxChars);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const stripped = e.target.value.replace(/[^0-9.\-]/g, "");
        onChange(Number(stripped) || 0);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`w-full text-data-xs text-center bg-transparent border-0 px-1 py-0 focus:outline-none focus:bg-accent/5 rounded ${
        highlighted ? "text-accent font-medium" : "text-text-primary"
      }`}
      style={{ fontFamily: "'Manrope', system-ui" }}
    />
  );
}

export function TransposedDetailTable({
  details,
  years,
  incomes,
  overrides,
  onIncomeChange,
  scrollRef: externalScrollRef,
  colWidth = 58,
  leftOffset = 88,
  rightOffset = 108,
  showIncomeRow = false,
}: TransposedDetailTableProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef || internalScrollRef;
  const fadeRef = useRef<HTMLDivElement>(null);
  useScrollFade(scrollRef, fadeRef);

  // Approximate max characters that fit in a column cell
  // ~6.5px per char at 12px Manrope, minus 8px horizontal padding (px-1 each side)
  const maxChars = useMemo(() => Math.max(4, Math.floor((colWidth - 8) / 6.5)), [colWidth]);

  return (
    <div className="flex text-body-sm">
      {/* Fixed row labels — width matches chart's left fixed area */}
      <div className="flex-shrink-0 flex flex-col border-r border-border" style={{ width: leftOffset }}>
        {showIncomeRow && (
          <div className="h-8 flex items-center justify-end text-text-tertiary text-data-xs font-medium px-2">
            Earned Income
          </div>
        )}
        <div className="h-8 flex items-center justify-end text-text-tertiary text-data-xs font-medium px-2">
          Additional tax
        </div>
      </div>

      {/* Scrollable columns (synced with chart scroll) */}
      <div ref={fadeRef} className="scroll-fade flex-1 min-w-0">
      <div ref={scrollRef} className="overflow-x-auto bracket-chart-scroll pb-2">
        <div className="flex" style={{ width: `${years.length * colWidth}px` }}>
          {years.map((yearInfo, i) => {
            const detail = details[i];
            const hasOverride = overrides.has(i);
            const effectiveIncome = overrides.get(i)?.income ?? incomes[i];

            return (
              <div
                key={yearInfo.year}
                className="flex flex-col overflow-hidden"
                style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
              >
                {/* Income (editable) — only in calculator mode */}
                {showIncomeRow && (
                  <div className="h-8 flex items-center justify-center">
                    <CompactCurrencyCell
                      value={effectiveIncome}
                      onChange={(val) => onIncomeChange(i, val)}
                      highlighted={!!(hasOverride && overrides.get(i)?.income !== undefined)}
                      maxChars={maxChars}
                    />
                  </div>
                )}

                {/* Tax cost */}
                <div
                  className="h-8 flex items-center justify-center text-data-xs text-text-primary px-1"
                  style={{ fontFamily: "'Manrope', system-ui" }}
                >
                  {detail ? formatTableCurrency(detail.tax_cost, maxChars) : "-"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {/* Right spacer — matches chart's right fixed area so scroll windows align */}
      <div className="flex-shrink-0" style={{ width: rightOffset }} />
    </div>
  );
}
