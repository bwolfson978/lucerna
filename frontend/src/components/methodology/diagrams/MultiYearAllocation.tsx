"use client";

import { BRACKET_COLORS, CHART_COLORS, DATA_FONT_FAMILY } from "@/lib/utils/constants";

interface YearColumn {
  year: string;
  income: string;
  incomeLevel: number; // 0-1, how much of bracket space is filled by income
  conversionLevel: number; // 0-1, how much additional space is filled by conversion
}

const YEARS: YearColumn[] = [
  { year: "Year 1", income: "$35K", incomeLevel: 0.12, conversionLevel: 0.55 },
  { year: "Year 2", income: "$30K", incomeLevel: 0.10, conversionLevel: 0.58 },
  { year: "Year 3", income: "$150K", incomeLevel: 0.52, conversionLevel: 0.08 },
];

// Bracket tiers in ascending order (10% at bottom, 32% at top)
const TIERS = [
  { rate: "10%", key: "0.10", height: 0.08 },
  { rate: "12%", key: "0.12", height: 0.16 },
  { rate: "22%", key: "0.22", height: 0.24 },
  { rate: "24%", key: "0.24", height: 0.26 },
  { rate: "32%", key: "0.32", height: 0.26 },
];

/**
 * Three-year comparison showing that conversions concentrate in low-income years
 * where bracket space is cheapest. Each column is a stacked bar of bracket space
 * with lowest brackets at the bottom (filling upward).
 */
export function MultiYearAllocation() {
  const labelFont = "'Inter', system-ui, sans-serif";

  const colWidth = 100;
  const colGap = 60;
  const barHeight = 200;
  const leftMargin = 80;
  const topMargin = 40;
  const totalWidth = leftMargin + YEARS.length * (colWidth + colGap);

  // Pre-compute tier positions (bottom-up: 10% at bottom, 32% at top)
  const tierPositions: { rate: string; key: string; y: number; h: number }[] = [];
  let cumY = topMargin + barHeight; // start from bottom
  for (const tier of TIERS) {
    const h = tier.height * barHeight;
    cumY -= h;
    tierPositions.push({ rate: tier.rate, key: tier.key, y: cumY, h });
  }

  return (
    <svg
      viewBox={`0 0 ${totalWidth} 340`}
      className="w-full max-w-[560px] mx-auto"
      role="img"
      aria-label="Three-year comparison showing conversions concentrated in low-income years where bracket space is cheapest"
    >
      {/* Bracket rate labels on the left (bottom-up) */}
      {tierPositions.map((tp) => {
        const color = BRACKET_COLORS[tp.key] || "#8B8A99";
        return (
          <g key={tp.rate}>
            <rect x={leftMargin - 6} y={tp.y} width="3" height={tp.h}
              fill={color} rx="1.5" />
            <text x={leftMargin - 14} y={tp.y + tp.h / 2 + 1}
              textAnchor="end" dominantBaseline="middle"
              fill={color} fontFamily={DATA_FONT_FAMILY} fontSize="10" fontWeight="700">
              {tp.rate}
            </text>
          </g>
        );
      })}

      {/* Year columns */}
      {YEARS.map((yearData, colIdx) => {
        const x = leftMargin + colIdx * (colWidth + colGap);

        // Draw bracket tiers (background rectangles)
        const tierBgs = tierPositions.map((tp) => (
          <rect key={tp.rate} x={x} y={tp.y} width={colWidth} height={tp.h}
            fill="rgba(255, 255, 255, 0.03)"
            stroke="rgba(255, 255, 255, 0.06)" strokeWidth="0.5" />
        ));

        // Income fill (from bottom up)
        const incomeHeight = yearData.incomeLevel * barHeight;
        const incomeY = topMargin + barHeight - incomeHeight;

        // Conversion fill (stacked above income)
        const convHeight = yearData.conversionLevel * barHeight;
        const convY = incomeY - convHeight;

        return (
          <g key={yearData.year}>
            {tierBgs}

            {/* Income fill */}
            <rect x={x} y={incomeY} width={colWidth} height={incomeHeight}
              fill={CHART_COLORS.income} opacity="0.6" />

            {/* Conversion fill */}
            {convHeight > 0 && (
              <rect x={x} y={convY} width={colWidth} height={convHeight}
                fill={CHART_COLORS.conversion} opacity="0.7" />
            )}

            {/* Year label */}
            <text x={x + colWidth / 2} y={topMargin + barHeight + 20}
              textAnchor="middle" fill="#FAF7F2"
              fontFamily={DATA_FONT_FAMILY} fontSize="13" fontWeight="700">
              {yearData.year}
            </text>

            {/* Income label */}
            <text x={x + colWidth / 2} y={topMargin + barHeight + 36}
              textAnchor="middle" fill="#8B8A99"
              fontFamily={labelFont} fontSize="10">
              Income: {yearData.income}
            </text>
          </g>
        );
      })}

      {/* Annotation */}
      <text x={leftMargin + (colWidth + colGap) - colGap / 2} y={topMargin + barHeight + 60}
        textAnchor="middle" fill="#F0C674"
        fontFamily={labelFont} fontSize="10" fontWeight="500">
        Most conversion fills cheapest brackets in low-income years
      </text>

      {/* Legend */}
      {(() => {
        const ly = topMargin + barHeight + 78;
        return (
          <g>
            <rect x={leftMargin} y={ly} width="12" height="12" rx="2"
              fill={CHART_COLORS.income} opacity="0.6" />
            <text x={leftMargin + 18} y={ly + 10} fill="#B8B0D2"
              fontFamily={labelFont} fontSize="10">Income</text>

            <rect x={leftMargin + 80} y={ly} width="12" height="12" rx="2"
              fill={CHART_COLORS.conversion} opacity="0.7" />
            <text x={leftMargin + 98} y={ly + 10} fill="#B8B0D2"
              fontFamily={labelFont} fontSize="10">Conversion</text>

            <rect x={leftMargin + 190} y={ly} width="12" height="12" rx="2"
              fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.06)" strokeWidth="0.5" />
            <text x={leftMargin + 208} y={ly + 10} fill="#B8B0D2"
              fontFamily={labelFont} fontSize="10">Empty bracket space</text>
          </g>
        );
      })()}
    </svg>
  );
}
