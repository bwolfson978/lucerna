"use client";

import { useState } from "react";
import { formatCurrency } from "./format";

export interface ConversionYear {
  year: number;
  conversion: number;
}

const W = 600;
const H = 64;

/** Conversion amount by year as small bars, with a tooltip on hover or focus. */
export function ConversionStrip({ schedule }: { schedule: ConversionYear[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...schedule.map((y) => y.conversion));
  const slot = W / Math.max(1, schedule.length);
  const barW = Math.max(4, Math.min(26, slot - 4));
  const tip = active != null ? schedule[active] : null;
  const tipLeft =
    active != null ? Math.min(Math.max(((slot * active + slot / 2) / W) * 100, 15), 85) : 0;

  return (
    <div className="relative" data-ui="conversion-strip">
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label="Conversion amount by year"
        onPointerLeave={() => setActive(null)}
      >
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" />
        {schedule.map((y, i) => {
          const h = y.conversion > 0 ? Math.max(2, (H - 4) * (y.conversion / max)) : 0;
          return (
            <g
              key={y.year}
              tabIndex={0}
              role="img"
              aria-label={`${y.year}: ${formatCurrency(y.conversion)} converted`}
              className="group outline-none"
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <rect x={slot * i} y={0} width={slot} height={H} fill="transparent" />
              <rect
                x={slot * i + (slot - barW) / 2}
                y={H - h}
                width={barW}
                height={h}
                rx={3}
                className="ui-grow-y fill-pine-mid group-hover:fill-pine group-focus:fill-pine"
                style={{ animationDelay: `${i * 25}ms` }}
              />
            </g>
          );
        })}
        <text x={0} y={H + 15} className="fill-text-tertiary font-mono text-[11px]">
          {schedule[0]?.year}
        </text>
        <text
          x={W}
          y={H + 15}
          textAnchor="end"
          className="fill-text-tertiary font-mono text-[11px]"
        >
          {schedule[schedule.length - 1]?.year}
        </text>
      </svg>
      {tip && (
        <div
          role="status"
          className="bg-pine-deep pointer-events-none absolute top-0 -translate-x-1/2 rounded-[12px] px-2.5 py-1.5 text-[12px] whitespace-nowrap text-[#f5f2ea]"
          style={{ left: `${tipLeft}%` }}
        >
          <span className="text-pine-haze block font-mono text-[11px]">{tip.year}</span>
          <strong className="font-data">{formatCurrency(tip.conversion)}</strong>
          <span className="text-pine-haze"> converted</span>
        </div>
      )}
    </div>
  );
}
