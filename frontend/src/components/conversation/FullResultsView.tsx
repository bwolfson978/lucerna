"use client";

import { useState } from "react";
import type { StoredResult } from "@/lib/agent/types";
import { ResultsView } from "@/components/results/ResultsView";
import { ChartSkeleton, MetricCardSkeleton } from "@/components/common/Skeleton";

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
      <div className="sticky top-[68px] z-30 -mx-default -mt-6 flex items-center justify-between gap-3 border-b border-border bg-paper/90 px-default py-2.5 backdrop-blur-[14px] md:-mx-page md:px-page">
        <button type="button" onClick={onBack} className="link-arrow min-h-[44px] text-[15px]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 4 6 8l4 4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to conversation
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
        <div className="flex flex-col gap-section" role="status" aria-label="Loading results">
          <div className="grid grid-cols-2 gap-default sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
          <ChartSkeleton />
        </div>
      )}
    </div>
  );
}
