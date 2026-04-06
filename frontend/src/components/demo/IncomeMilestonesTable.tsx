"use client";

import type { YearlyIncome } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/formatting";

interface IncomeMilestonesTableProps {
  timeline: YearlyIncome[];
}

export function IncomeMilestonesTable({
  timeline,
}: IncomeMilestonesTableProps) {
  const colWidth = 58;

  return (
    <div className="flex text-body-sm">
      {/* Fixed row labels */}
      <div className="flex-shrink-0 w-[70px] flex flex-col border-r border-border">
        <div className="h-8 flex items-center text-text-tertiary text-[10px] font-medium px-1">
          Year
        </div>
        <div className="h-8 flex items-center text-text-tertiary text-[10px] font-medium px-1">
          Income
        </div>
        <div className="h-8 flex items-center text-text-tertiary text-[10px] font-medium px-1">
          Notes
        </div>
      </div>

      {/* Scrollable columns */}
      <div className="overflow-x-auto flex-1">
        <div
          className="flex"
          style={{ width: `${timeline.length * colWidth}px` }}
        >
          {timeline.map((yi) => (
            <div
              key={yi.year}
              className="flex flex-col"
              style={{ width: `${colWidth}px` }}
            >
              {/* Year */}
              <div
                className="h-8 flex items-center justify-center text-[10px] text-text-secondary"
                style={{ fontFamily: "'Manrope', system-ui" }}
              >
                {yi.year}
              </div>

              {/* Income */}
              <div
                className="h-8 flex items-center justify-center text-[10px] text-text-primary"
                style={{ fontFamily: "'Manrope', system-ui" }}
              >
                {formatCurrency(yi.gross_income)}
              </div>

              {/* Notes */}
              <div className="h-8 flex items-center justify-center text-[9px] text-text-tertiary">
                {yi.notes || "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
