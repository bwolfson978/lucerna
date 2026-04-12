"use client";

import { BRACKET_COLORS, CHART_COLORS, DATA_FONT_FAMILY } from "@/lib/utils/constants";

interface YearColumn {
  year: string;
  income: string;
  incomeLevel: number; // 0-1, how much of bracket space is filled by income
  conversionLevel: number; // 0-1, how much additional space is filled by conversion
  label: string;
}

const YEARS: YearColumn[] = [
  { year: "Year 1", income: "$35K", incomeLevel: 0.12, conversionLevel: 0.55, label: "Low income: most conversion" },
  { year: "Year 2", income: "$30K", incomeLevel: 0.10, conversionLevel: 0.58, label: "Low income: most conversion" },
  { year: "Year 3", income: "$150K", incomeLevel: 0.52, conversionLevel: 0.08, label: "High income: little room" },
];

/**
 * Three-year comparison showing that conversions concentrate in low-income years
 * where bracket space is cheapest. Each column is a stacked bar of bracket space.
 */
export function MultiYearAllocation() {
  const labelFont = "'Inter', system-ui, sans-serif";

  const colWidth = 100;
  const colGap = 60;
  const barHeight = 200;
  const leftMargin = 80;
  const topMargin = 40;

  // Bracket tiers (simplified to 5 for visual clarity)
  const tiers = [
    { rate: "10%", key: "0.10", height: 0.08 },
    { rate: "12%", key: "0.12", height: 0.16 },
    { rate: "22%", key: "0.22", height: 0.24 },
    { rate: "24%", key: "0.24", height: 0.26 },
    { rate: "32%", key: "0.32", height: 0.26 },
  ];

  const totalWidth = leftMargin + YEARS.length * (colWidth + colGap);

  return (
    <svg
      viewBox={`0 0 ${totalWidth} 340`}
      className="w-full max-w-[560px] mx-auto"
      role="img"
      aria-label="Three-year comparison showing conversions concentrated in low-income years where bracket space is cheapest"
    >
      {/* Bracket rate labels on the left */}
      {(() => {
        let cumY = topMargin;
        return tiers.map((tier) => {
          const tierH = tier.height * barHeight;
          const y = cumY;
          cumY += tierH;
          const color = BRACKET_COLORS[tier.key] || "#8B8A99";
          return (
            <g key={tier.rate}>
              <rect x={leftMargin - 6} y={y} width="3" height={tierH}
                fill={color} rx="1.5" />
              <text x={leftMargin - 14} y={y + tierH / 2 + 1}
                textAnchor="end" dominantBaseline="middle"
                fill={color} fontFamily={DATA_FONT_FAMILY} fontSize="10" fontWeight="700">
                {tier.rate}
              </text>
            </g>
          );
        });
      })()}

      {/* Year columns */}
      {YEARS.map((yearData, colIdx) => {
        const x = leftMargin + colIdx * (colWidth + colGap);

        // Draw bracket tiers
        let cumY = topMargin;
        const tierElements = tiers.map((tier) => {
          const tierH = tier.height * barHeight;
          const y = cumY;
          cumY += tierH;
          return (
            <rect key={tier.rate} x={x} y={y} width={colWidth} height={tierH}
              fill="rgba(255, 255, 255, 0.03)"
              stroke="rgba(255, 255, 255, 0.06)" strokeWidth="0.5" />
          );
        });

        // Income fill (from bottom up)
        const incomeHeight = yearData.incomeLevel * barHeight;
        const incomeY = topMargin + barHeight - incomeHeight;

        // Conversion fill (on top of income)
        const convHeight = yearData.conversionLevel * barHeight;
        const convY = incomeY - convHeight;

        return (
          <g key={yearData.year}>
            {tierElements}

            {/* Income fill */}
            <rect x={x} y={incomeY} width={colWidth} height={incomeHeight}
              fill={CHART_COLORS.income} opacity="0.6" rx="0" />

            {/* Conversion fill */}
            {convHeight > 0 && (
              <rect x={x} y={convY} width={colWidth} height={convHeight}
                fill={CHART_COLORS.conversion} opacity="0.7" rx="0" />
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

      {/* Annotation arrows pointing to Year 1 and 2's gold blocks */}
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
