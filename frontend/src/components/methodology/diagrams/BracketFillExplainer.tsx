"use client";

import { BRACKET_COLORS, CHART_COLORS, DATA_FONT_FAMILY } from "@/lib/utils/constants";

interface BracketRow {
  rate: string;
  rateKey: string;
  label: string;
  capacity: number;
  filledByIncome: number;
  filledByConversion: number;
}

const EXAMPLE_BRACKETS: BracketRow[] = [
  { rate: "10%", rateKey: "0.10", label: "$0 - $11,600", capacity: 11600, filledByIncome: 11600, filledByConversion: 0 },
  { rate: "12%", rateKey: "0.12", label: "$11,600 - $47,150", capacity: 35550, filledByIncome: 8800, filledByConversion: 26750 },
  { rate: "22%", rateKey: "0.22", label: "$47,150 - $100,525", capacity: 53375, filledByIncome: 0, filledByConversion: 23250 },
  { rate: "24%", rateKey: "0.24", label: "$100,525 - $191,950", capacity: 91425, filledByIncome: 0, filledByConversion: 0 },
  { rate: "32%", rateKey: "0.32", label: "$191,950 - $243,700", capacity: 51750, filledByIncome: 0, filledByConversion: 0 },
  { rate: "35%", rateKey: "0.35", label: "$243,700 - $609,350", capacity: 365650, filledByIncome: 0, filledByConversion: 0 },
];

/**
 * Static bracket fill visualization showing how income fills from the bottom
 * and conversions fill the next available space. Uses a hypothetical example
 * of someone with $35K income converting $50K.
 */
export function BracketFillExplainer() {
  const labelFont = "'Inter', system-ui, sans-serif";
  const maxCapacity = Math.max(...EXAMPLE_BRACKETS.map((b) => b.capacity));
  const barMaxWidth = 320;
  const barHeight = 28;
  const rowGap = 10;
  const leftMargin = 120;
  const topMargin = 50;

  const svgHeight = topMargin + EXAMPLE_BRACKETS.length * (barHeight + rowGap) + 60;

  return (
    <svg
      viewBox={`0 0 560 ${svgHeight}`}
      className="w-full max-w-[560px] mx-auto"
      role="img"
      aria-label="Diagram showing how income fills lower tax brackets and Roth conversions fill the next available space"
    >
      {/* Title annotation */}
      <text x="280" y="20" textAnchor="middle" fill="#B8B0D2"
        fontFamily={labelFont} fontSize="11" fontWeight="500">
        EXAMPLE: $35K INCOME + $50K CONVERSION (SINGLE FILER)
      </text>

      {EXAMPLE_BRACKETS.map((bracket, i) => {
        const y = topMargin + i * (barHeight + rowGap);
        const scale = barMaxWidth / maxCapacity;
        const incomeWidth = bracket.filledByIncome * scale;
        const conversionWidth = bracket.filledByConversion * scale;
        const totalCapWidth = Math.min(bracket.capacity, maxCapacity) * scale;
        const bracketColor = BRACKET_COLORS[bracket.rateKey] || "#8B8A99";

        return (
          <g key={bracket.rate}>
            {/* Bracket color indicator */}
            <rect x={leftMargin - 6} y={y} width="3" height={barHeight}
              rx="1.5" fill={bracketColor} />

            {/* Rate label */}
            <text x={leftMargin - 14} y={y + barHeight / 2 + 1}
              textAnchor="end" dominantBaseline="middle"
              fill="#FAF7F2" fontFamily={DATA_FONT_FAMILY} fontSize="13" fontWeight="700">
              {bracket.rate}
            </text>

            {/* Background (total capacity) */}
            <rect x={leftMargin} y={y} width={totalCapWidth} height={barHeight}
              rx="4" fill="rgba(255, 255, 255, 0.04)"
              stroke="rgba(255, 255, 255, 0.06)" strokeWidth="0.5" />

            {/* Income fill */}
            {incomeWidth > 0 && (
              <rect x={leftMargin} y={y} width={incomeWidth} height={barHeight}
                rx="4" fill={CHART_COLORS.income} opacity="0.7" />
            )}

            {/* Conversion fill */}
            {conversionWidth > 0 && (
              <rect
                x={leftMargin + incomeWidth}
                y={y}
                width={conversionWidth}
                height={barHeight}
                rx="4"
                fill={CHART_COLORS.conversion}
                opacity="0.75"
              />
            )}

            {/* Dollar range label */}
            <text
              x={leftMargin + totalCapWidth + 8}
              y={y + barHeight / 2 + 1}
              dominantBaseline="middle"
              fill="#8B8A99"
              fontFamily={DATA_FONT_FAMILY}
              fontSize="10"
            >
              {bracket.label}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      {(() => {
        const legendY = topMargin + EXAMPLE_BRACKETS.length * (barHeight + rowGap) + 16;
        return (
          <g>
            <rect x={leftMargin} y={legendY} width="12" height="12" rx="2"
              fill={CHART_COLORS.income} opacity="0.7" />
            <text x={leftMargin + 18} y={legendY + 10} fill="#B8B0D2"
              fontFamily={labelFont} fontSize="11">
              Earned income
            </text>

            <rect x={leftMargin + 130} y={legendY} width="12" height="12" rx="2"
              fill={CHART_COLORS.conversion} opacity="0.75" />
            <text x={leftMargin + 148} y={legendY + 10} fill="#B8B0D2"
              fontFamily={labelFont} fontSize="11">
              Roth conversion
            </text>

            <rect x={leftMargin + 270} y={legendY} width="12" height="12" rx="2"
              fill="rgba(255, 255, 255, 0.04)" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="0.5" />
            <text x={leftMargin + 288} y={legendY + 10} fill="#B8B0D2"
              fontFamily={labelFont} fontSize="11">
              Remaining space
            </text>
          </g>
        );
      })()}
    </svg>
  );
}
