"use client";

import { formatCurrency } from "./format";

interface MostSavingsNoteProps {
  /** Whether the amount shown is the one with the most savings. */
  atOptimal: boolean;
  /** How much less the amount shown saves than the most savings. */
  shortfall: number;
  /** Go back to the amount with the most savings. Omit to hide the button. */
  onBack?: () => void;
  /** What the headline number means, said after "Most savings". */
  caption?: string;
}

const Diamond = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor" />
  </svg>
);

/**
 * The line under a savings headline that says where the conversion slider stands: at
 * the most savings (with the diamond that marks that spot on the slider's track), or
 * how much less the chosen amount saves, with the way back. One line where there is
 * room; on a phone both states wrap to two.
 */
export function MostSavingsNote({ atOptimal, shortfall, onBack, caption }: MostSavingsNoteProps) {
  return (
    <div
      className="text-caption flex min-h-[24px] flex-wrap items-center gap-x-2.5 gap-y-0.5"
      data-ui="most-savings-note"
    >
      {atOptimal ? (
        <>
          <span className="text-pine inline-flex items-center gap-1.5 font-semibold">
            <Diamond />
            Most savings
          </span>
          {caption && <span className="text-text-tertiary">{caption}</span>}
        </>
      ) : (
        <>
          <span className="text-negative" data-ui="shortfall">
            {formatCurrency(Math.max(1, shortfall))} less than the most savings
          </span>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-pine hover:text-pine-mid inline-flex min-h-[24px] items-center gap-1.5 font-semibold underline underline-offset-[3px] transition-colors"
            >
              <Diamond />
              Back to most savings
            </button>
          )}
        </>
      )}
    </div>
  );
}
