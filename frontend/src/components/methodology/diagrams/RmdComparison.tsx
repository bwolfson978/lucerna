"use client";

import { CHART_COLORS, DATA_FONT_FAMILY } from "@/lib/utils/constants";

/**
 * Before/after comparison showing how Roth conversions reduce
 * future Required Minimum Distributions. Two side-by-side bar clusters.
 */
export function RmdComparison() {
  const labelFont = "'Inter', system-ui, sans-serif";

  const left = 40;
  const barWidth = 60;
  const groupGap = 100;
  const barBottom = 180;
  const maxBarHeight = 140;

  // Group 1: Without conversion
  const g1x = left + 40;
  const tradNoConv = 0.85; // large traditional balance
  const rmdNoConv = 0.70; // large RMDs
  const rothNoConv = 0.05; // small Roth

  // Group 2: With conversion
  const g2x = g1x + barWidth * 2 + groupGap;
  const tradWithConv = 0.35; // reduced traditional
  const rmdWithConv = 0.28; // reduced RMDs
  const rothWithConv = 0.55; // larger Roth

  function BarGroup({
    x,
    tradHeight,
    rmdHeight,
    rothHeight,
    title,
  }: {
    x: number;
    tradHeight: number;
    rmdHeight: number;
    rothHeight: number;
    title: string;
  }) {
    const tradH = tradHeight * maxBarHeight;
    const rmdH = rmdHeight * maxBarHeight;
    const rothH = rothHeight * maxBarHeight;

    return (
      <g>
        {/* Title */}
        <text x={x + barWidth} y={20} textAnchor="middle" fill="#FAF7F2"
          fontFamily={labelFont} fontSize="11" fontWeight="600">
          {title}
        </text>

        {/* Traditional balance bar */}
        <rect x={x} y={barBottom - tradH} width={barWidth} height={tradH}
          rx="4" fill={CHART_COLORS.income} opacity="0.5" />
        <text x={x + barWidth / 2} y={barBottom - tradH - 6} textAnchor="middle"
          fill="#B8B0D2" fontFamily={labelFont} fontSize="9">
          Traditional
        </text>

        {/* RMD indicator bar (overlaid on traditional, showing forced withdrawal) */}
        <rect x={x + 4} y={barBottom - rmdH} width={barWidth - 8} height={rmdH}
          rx="3" fill="#E87070" opacity="0.25"
          stroke="#E87070" strokeWidth="1" strokeDasharray="3 2" />
        {rmdH > 30 && (
          <text x={x + barWidth / 2} y={barBottom - rmdH / 2 + 4} textAnchor="middle"
            fill="#E87070" fontFamily={DATA_FONT_FAMILY} fontSize="9" fontWeight="600">
            RMDs
          </text>
        )}

        {/* Roth balance bar */}
        <rect x={x + barWidth + 10} y={barBottom - rothH} width={barWidth} height={rothH}
          rx="4" fill={CHART_COLORS.conversion} opacity="0.5" />
        <text x={x + barWidth + 10 + barWidth / 2} y={barBottom - rothH - 6}
          textAnchor="middle" fill="#B8B0D2" fontFamily={labelFont} fontSize="9">
          Roth
        </text>
      </g>
    );
  }

  return (
    <svg
      viewBox="0 0 560 230"
      className="w-full max-w-[560px] mx-auto"
      role="img"
      aria-label="Comparison showing that converting to Roth reduces traditional IRA balance and future Required Minimum Distributions"
    >
      <BarGroup
        x={g1x}
        tradHeight={tradNoConv}
        rmdHeight={rmdNoConv}
        rothHeight={rothNoConv}
        title="Without conversion"
      />

      {/* Arrow between groups */}
      <line x1={g1x + barWidth * 2 + 20} y1={barBottom / 2 + 20}
        x2={g2x - 20} y2={barBottom / 2 + 20}
        stroke="#F0C674" strokeWidth="1.5" strokeOpacity="0.4" />
      <polygon
        points={`${g2x - 22},${barBottom / 2 + 16} ${g2x - 14},${barBottom / 2 + 20} ${g2x - 22},${barBottom / 2 + 24}`}
        fill="#F0C674" opacity="0.5"
      />
      <text x={(g1x + barWidth * 2 + 20 + g2x - 20) / 2} y={barBottom / 2 + 10}
        textAnchor="middle" fill="#F0C674"
        fontFamily={labelFont} fontSize="9" fontWeight="500">
        Convert
      </text>

      <BarGroup
        x={g2x}
        tradHeight={tradWithConv}
        rmdHeight={rmdWithConv}
        rothHeight={rothWithConv}
        title="With conversion"
      />

      {/* Bottom labels */}
      <text x={g1x + barWidth} y={barBottom + 18} textAnchor="middle"
        fill="#E87070" fontFamily={labelFont} fontSize="9">
        Large forced taxable withdrawals
      </text>
      <text x={g2x + barWidth} y={barBottom + 18} textAnchor="middle"
        fill="#5EBD8C" fontFamily={labelFont} fontSize="9">
        Smaller RMDs, more tax-free growth
      </text>

      {/* Legend */}
      <g>
        <rect x={left} y={212} width="10" height="10" rx="2"
          fill="#E87070" opacity="0.25" stroke="#E87070" strokeWidth="0.5" />
        <text x={left + 16} y={221} fill="#B8B0D2"
          fontFamily={labelFont} fontSize="9">
          Required Minimum Distributions (taxed)
        </text>
      </g>
    </svg>
  );
}
