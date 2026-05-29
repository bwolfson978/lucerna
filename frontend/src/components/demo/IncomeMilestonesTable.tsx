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
    <div className="overflow-x-auto">
      <div
        className="grid text-body-sm"
        style={{ gridTemplateColumns: `80px repeat(${timeline.length}, ${colWidth}px)` }}
      >
        {/* Year row */}
        <div className="sticky left-0 z-10 flex h-8 items-center border-r border-border bg-bg px-1 text-data-xs font-medium text-text-tertiary">
          Year
        </div>
        {timeline.map((yi) => (
          <div
            key={`year-${yi.year}`}
            className="flex h-8 items-center justify-center text-data-xs text-text-secondary"
            style={dataFontStyle}
          >
            {yi.year}
          </div>
        ))}

        {/* Income row */}
        <div className="sticky left-0 z-10 flex h-8 items-center border-r border-border bg-bg px-1 text-data-xs font-medium text-text-tertiary">
          Income
        </div>
        {timeline.map((yi) => (
          <div
            key={`income-${yi.year}`}
            className="flex h-8 items-center justify-center px-0.5 text-data-xs text-text-primary"
            style={dataFontStyle}
          >
            {formatCompactCurrency(yi.gross_income)}
          </div>
        ))}

        {/* Notes row — min-h lets the entire row expand if any cell wraps */}
        <div className="sticky left-0 z-10 flex min-h-8 items-start border-r border-border bg-bg px-1 py-2 text-data-xs font-medium text-text-tertiary">
          Notes
        </div>
        {timeline.map((yi) => (
          <div
            key={`notes-${yi.year}`}
            className="flex min-h-8 items-start justify-center break-words px-0.5 py-2 text-center text-[11px] leading-tight text-text-tertiary"
            title={yi.notes || undefined}
          >
            {yi.notes || "-"}
          </div>
        ))}
      </div>
    </div>
  );
}
