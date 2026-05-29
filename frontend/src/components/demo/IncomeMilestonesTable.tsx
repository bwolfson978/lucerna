"use client";

import type { PlanYear } from "@/lib/types";
import { formatCompactCurrency } from "@/lib/utils/formatting";
import { dataFontStyle } from "@/lib/utils/constants";

interface IncomeMilestonesTableProps {
  timeline: PlanYear[];
}

export function IncomeMilestonesTable({ timeline }: IncomeMilestonesTableProps) {
  const colWidth = 66;

  return (
    <div className="flex text-body-sm">
      {/* Fixed row labels */}
      <div className="flex w-[80px] flex-shrink-0 flex-col border-r border-border">
        <div className="flex h-8 items-center px-1 text-data-xs font-medium text-text-tertiary">
          Year
        </div>
        <div className="flex h-8 items-center px-1 text-data-xs font-medium text-text-tertiary">
          Income
        </div>
        <div className="flex h-8 items-center px-1 text-data-xs font-medium text-text-tertiary">
          Notes
        </div>
      </div>

      {/* Scrollable columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex" style={{ width: `${timeline.length * colWidth}px` }}>
          {timeline.map((yi) => (
            <div
              key={yi.year}
              className="flex flex-col overflow-hidden"
              style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
            >
              {/* Year */}
              <div
                className="flex h-8 items-center justify-center text-data-xs text-text-secondary"
                style={dataFontStyle}
              >
                {yi.year}
              </div>

              {/* Income */}
              <div
                className="flex h-8 items-center justify-center px-0.5 text-data-xs text-text-primary"
                style={dataFontStyle}
              >
                {formatCompactCurrency(yi.gross_income)}
              </div>

              {/* Notes */}
              <div
                className="flex h-8 items-center justify-center px-0.5 text-center text-[11px] text-text-tertiary"
                title={yi.notes || undefined}
              >
                {yi.notes || "-"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
