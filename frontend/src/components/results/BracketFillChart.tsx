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
    <div className="flex flex-col gap-tight">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">
          Bracket fill{year ? ` — ${year}` : ""}
        </h3>
        <Tooltip content="Shows how your income and Roth conversion fill each federal tax bracket. Green brackets are cheaper; red brackets are more expensive." />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-body-sm">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-neutral" />
          Income
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-accent" />
          Conversion
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-bg-hover" />
          Remaining capacity
        </span>
      </div>

      <svg
        viewBox={`0 0 600 ${data.length * 40 + 8}`}
        className="w-full"
        role="img"
        aria-label="Bracket fill visualization"
      >
        {data.map((bracket, i) => {
          const y = i * 40 + 4;
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
                y={y + 22}
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
                  height={32}
                  fill="#6B7280"
                  rx={2}
                />
              )}

              {/* Conversion segment */}
              {conversionWidth > 0 && (
                <rect
                  x={barX + incomeWidth}
                  y={y}
                  width={conversionWidth}
                  height={32}
                  fill="#2563EB"
                  rx={2}
                />
              )}

              {/* Remaining capacity */}
              {remainingWidth > 1 && (
                <rect
                  x={barX + incomeWidth + conversionWidth}
                  y={y}
                  width={remainingWidth}
                  height={32}
                  fill="rgba(0,0,0,0.04)"
                  rx={2}
                />
              )}

              {/* Bracket color indicator */}
              <rect
                x={barX - 4}
                y={y}
                width={3}
                height={32}
                fill={color}
                rx={1}
              />

              {/* Dollar amount label */}
              {bracket.filled_by_income + bracket.filled_by_conversion >
                0 && (
                <text
                  x={
                    barX +
                    incomeWidth +
                    conversionWidth +
                    8
                  }
                  y={y + 22}
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
