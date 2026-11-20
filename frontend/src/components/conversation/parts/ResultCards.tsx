"use client";

/**
 * Native render of the shared result card (ui/) for a conversation part that points at a
 * stored result. Results from tools with MCP App Views render through McpAppFrame
 * instead; both show the same component the same server-built data.
 */

import { useEffect } from "react";
import posthog from "posthog-js";
import { ResultCard } from "@lucerna/ui";
import type { StoredResult } from "@/lib/agent/types";
import { resultDisplay } from "@/lib/results/viewData";
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
  const { openResults, send } = useConversationContext();
  const stored = useStoredResult(resultId);
  if (!stored) return null;
  const display = stored.result && resultDisplay(resultId, stored.result);
  if (!display) return <Pending />;
  return (
    <div data-testid="result-headline">
      <ResultCard
        data={display.data}
        details={display.details}
        onOpenFullResults={() => openFull(openResults, resultId, "headline")}
        onAsk={send}
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
