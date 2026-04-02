"use client";

import { useState, ReactNode } from "react";

interface TooltipProps {
  content: string;
  children?: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children || (
        <button
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 text-text-tertiary hover:text-text-secondary transition-colors duration-300"
          aria-label="More info"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
            <text
              x="7"
              y="10.5"
              textAnchor="middle"
              fill="currentColor"
              fontSize="9"
              fontWeight="600"
            >
              ?
            </text>
          </svg>
        </button>
      )}
      {visible && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 px-3 py-2 bg-bg-elevated border border-glass-border text-text-primary text-body-sm rounded-lg max-w-[280px] whitespace-normal pointer-events-none shadow-elevated"
        >
          {content}
        </span>
      )}
    </span>
  );
}
