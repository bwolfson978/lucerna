"use client";

import type { BracketFillResult } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";
import { BRACKET_COLORS } from "@/lib/utils/constants";
import { Tooltip } from "@/components/common/Tooltip";

interface BracketFillChartProps {
  data: BracketFillResult[];
  year?: number;
}

export function BracketFillChart({ data, year }: BracketFillChartProps) {
  if (!data || data.length === 0) return null;

  const maxCapacity = Math.max(...data.map((b) => b.bracket_capacity));

  return (
    <div className="card flex flex-col gap-default">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">
          Bracket fill{year ? ` — ${year}` : ""}
        </h3>
        <Tooltip content="Shows how your income and Roth conversion fill each federal tax bracket. Green brackets are cheaper; red brackets are more expensive." />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-body-sm text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-neutral" />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-accent" />
          Conversion
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-bg-hover border border-border" />
          Remaining capacity
        </span>
      </div>

      <svg
        viewBox={`0 0 600 ${data.length * 44 + 8}`}
        className="w-full"
        role="img"
        aria-label="Bracket fill visualization"
      >
        {data.map((bracket, i) => {
          const y = i * 44 + 4;
          const barWidth = 460;
          const labelX = 0;
          const barX = 80;
          const scale = barWidth / maxCapacity;

          const incomeWidth = bracket.filled_by_income * scale;
          const conversionWidth = bracket.filled_by_conversion * scale;
          const remainingWidth = bracket.remaining_capacity * scale;

          const color =
            BRACKET_COLORS[bracket.bracket_rate.toFixed(2)] || "#6B7280";

          return (
            <g key={bracket.bracket_rate}>
              {/* Bracket rate label */}
              <text
                x={labelX}
                y={y + 23}
                className="text-[13px] font-medium fill-text-secondary"
                fontFamily="'JetBrains Mono', monospace"
              >
                {formatPercent(bracket.bracket_rate)}
              </text>

              {/* Income segment */}
              {incomeWidth > 0 && (
                <rect
                  x={barX}
                  y={y}
                  width={incomeWidth}
                  height={34}
                  fill="#6B7280"
                  rx={4}
                />
              )}

              {/* Conversion segment */}
              {conversionWidth > 0 && (
                <rect
                  x={barX + incomeWidth}
                  y={y}
                  width={conversionWidth}
                  height={34}
                  fill="#4F46E5"
                  rx={4}
                />
              )}

              {/* Remaining capacity */}
              {remainingWidth > 1 && (
                <rect
                  x={barX + incomeWidth + conversionWidth}
                  y={y}
                  width={remainingWidth}
                  height={34}
                  fill="rgba(0,0,0,0.03)"
                  rx={4}
                />
              )}

              {/* Bracket color indicator */}
              <rect
                x={barX - 5}
                y={y + 2}
                width={3}
                height={30}
                fill={color}
                rx={1.5}
              />

              {/* Dollar amount label */}
              {bracket.filled_by_income + bracket.filled_by_conversion >
                0 && (
                <text
                  x={
                    barX +
                    incomeWidth +
                    conversionWidth +
                    10
                  }
                  y={y + 23}
                  className="text-[11px] fill-text-tertiary"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {formatCurrency(
                    bracket.filled_by_income +
                      bracket.filled_by_conversion
                  )}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
