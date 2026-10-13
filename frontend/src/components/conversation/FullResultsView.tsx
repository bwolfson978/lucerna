"use client";

import { useState } from "react";
import type { StoredResult } from "@/lib/agent/types";
import { ResultsView } from "@/components/results/ResultsView";
import { ChartSkeleton } from "@/components/common/Skeleton";

interface FullResultsViewProps {
  stored: StoredResult;
  onBack: () => void;
  onApply?: () => void;
}

/** The complete analysis for one result, opened from the conversation. */
export function FullResultsView({ stored, onBack, onApply }: FullResultsViewProps) {
  const [applied, setApplied] = useState(false);
  const isWhatIf = stored.label !== "Your scenario";

  return (
    <div className="flex flex-col gap-section">
      {/* Sits flush under the site header and spans the page's gutters. */}
      <div className="sticky top-[68px] z-30 -mx-default -mb-4 -mt-section flex items-center justify-between gap-3 bg-paper/90 px-default py-1.5 backdrop-blur-[14px] sm:-mx-7 sm:-mt-section-lg sm:px-7">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversation"
          className="link-arrow -ml-1 min-h-[44px] text-[15px]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 4 6 8l4 4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {/* Short on phones so it stays on one line beside "Apply to my scenario". */}
          <span className="sm:hidden">Back</span>
          <span className="hidden sm:inline">Back to conversation</span>
        </button>
        {isWhatIf && onApply && (
          <button
            type="button"
            className="btn-ghost min-h-[40px] px-4 py-2 text-[14px]"
            disabled={applied}
            onClick={() => {
              onApply();
              setApplied(true);
            }}
          >
            {applied ? "Applied" : "Apply to my scenario"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow-pine">{isWhatIf ? "What if" : "Full results"}</span>
        <h1 className="display-heading text-[clamp(1.8rem,3.6vw,2.6rem)]">
          {isWhatIf ? stored.label : "Your scenario"}
        </h1>
      </div>

      {stored.result ? (
        <ResultsView result={stored.result} />
      ) : (
        <div role="status" aria-label="Loading results">
          <ChartSkeleton />
        </div>
      )}
    </div>
  );
}
