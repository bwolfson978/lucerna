"use client";

/**
 * Native renders of the shared cards (ui/) for conversation parts that point at stored
 * results: the `show` tool's charts, and parts saved by earlier versions. Results
 * from tools with MCP App Views render through McpAppFrame instead; both use the
 * same components with the same data (lib/results/viewData.ts).
 */

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import {
  BalanceComparison,
  ResultCard,
  ScenarioCompareCard as SharedScenarioCompareCard,
} from "@lucerna/ui";
import type { StoredResult } from "@/lib/agent/types";
import { balanceData, compareData, resultCardData, resultDetails } from "@/lib/results/viewData";
import { useConversationContext } from "../ConversationContext";

/** Look up a result, recomputing it if it was dropped from session storage. */
function useStoredResult(id: string): StoredResult | undefined {
  const { results, ensureResult } = useConversationContext();
  const stored = results[id];
  const missing = stored != null && stored.result == null;
  useEffect(() => {
    if (missing) ensureResult(id);
  }, [missing, ensureResult, id]);
  return stored;
}

function Pending({ label = "Loading this result" }: { label?: string }) {
  return (
    <div className="card animate-pulse text-body-sm text-text-tertiary" role="status">
      {label}…
    </div>
  );
}

function openFull(openResults: (id: string) => void, id: string, from: string) {
  posthog.capture("full_results_opened", { from });
  openResults(id);
}

// --------------------------------------------------------------------------

export function ResultHeadlineCard({ resultId }: { resultId: string }) {
  const { openResults } = useConversationContext();
  const stored = useStoredResult(resultId);
  if (!stored) return null;
  const result = stored.result;
  if (!result) return <Pending />;
  return (
    <div data-testid="result-headline">
      <ResultCard
        data={resultCardData(resultId, result)}
        details={resultDetails(result)}
        onOpenFullResults={() => openFull(openResults, resultId, "headline")}
      />
    </div>
  );
}

export function BalanceComparisonCard({ resultId }: { resultId: string }) {
  const stored = useStoredResult(resultId);
  if (!stored) return null;
  if (!stored.result) return <Pending />;
  return (
    <div data-testid="balance-comparison">
      <BalanceComparison data={balanceData(stored.result)} />
    </div>
  );
}

export function ScenarioCompareCard({
  resultId,
  baseResultId,
  label,
}: {
  resultId: string;
  baseResultId: string;
  label: string;
}) {
  const { openResults, applyWhatIf, streaming } = useConversationContext();
  const [applied, setApplied] = useState(false);
  const variant = useStoredResult(resultId);
  const base = useStoredResult(baseResultId);
  if (!variant || !base) return null;
  if (!variant.result || !base.result) return <Pending />;
  return (
    <div data-testid="scenario-compare">
      <SharedScenarioCompareCard
        data={compareData(baseResultId, base.result, resultId, variant.result, label)}
        onOpenFullResults={() => openFull(openResults, resultId, "what_if")}
        onApply={
          applyWhatIf && variant.draft
            ? () => {
                applyWhatIf(resultId);
                setApplied(true);
              }
            : undefined
        }
        applied={applied}
        applyDisabled={streaming}
      />
    </div>
  );
}

// --------------------------------------------------------------------------

export function SuggestionChips({
  suggestions,
  disabled,
}: {
  suggestions: string[];
  disabled?: boolean;
}) {
  const { send } = useConversationContext();
  return (
    <div className="flex flex-wrap gap-2" data-testid="suggestions">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => {
            posthog.capture("suggestion_tapped");
            send(s);
          }}
          className="min-h-[40px] rounded-full border border-border bg-white px-4 py-2 text-left text-[14.5px] font-medium text-text-primary transition-colors duration-200 hover:border-pine-mid hover:text-pine disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
