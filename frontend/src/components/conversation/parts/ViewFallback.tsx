"use client";

/**
 * What the host shows natively while an MCP App View loads, or if it fails: the same
 * shared component the View renders, fed the same tool result. When the View is ready
 * it replaces this with no visible change (e2e/tests/ui-drift.spec.ts checks).
 */

import { useState } from "react";
import {
  ResultCard,
  ScenarioCompareCard,
  ScenarioSummary,
  applyWhatIfMessage,
  isResultCardData,
  isResultDetails,
  isScenarioCompareData,
  isScenarioSummaryData,
} from "@lucerna/ui";
import type { McpToolResult } from "@/lib/agent/types";

export const VIEW_META_KEY = "lucerna/view";

interface ViewFallbackProps {
  toolResult: McpToolResult;
  /** Open the in-app results page for a result, if the host knows it. */
  openResult?: (resultId: string) => (() => void) | undefined;
  /** Send a chat message, as a View's `ui/message` would. */
  sendMessage?: (text: string) => void;
}

/** Whether a tool result has a shared component to show natively. */
export function hasViewFallback(toolResult: McpToolResult): boolean {
  const data = toolResult.structuredContent;
  return (
    !toolResult.isError &&
    (isResultCardData(data) || isScenarioCompareData(data) || isScenarioSummaryData(data))
  );
}

/** The native render of a View's tool result, or null if it has no shared component. */
export function ViewFallback({ toolResult, openResult, sendMessage }: ViewFallbackProps) {
  const [applied, setApplied] = useState(false);
  const data = toolResult.structuredContent;
  if (toolResult.isError || !data) return null;

  if (isResultCardData(data)) {
    const details = toolResult._meta?.[VIEW_META_KEY];
    return (
      <ResultCard
        data={data}
        details={isResultDetails(details) ? details : undefined}
        onOpenFullResults={openResult?.(data.result_id)}
        onAsk={sendMessage}
      />
    );
  }
  if (isScenarioCompareData(data)) {
    return (
      <ScenarioCompareCard
        data={data}
        onOpenFullResults={openResult?.(data.variant_result_id)}
        onApply={
          sendMessage
            ? () => {
                sendMessage(applyWhatIfMessage(data.label));
                setApplied(true);
              }
            : undefined
        }
        applied={applied}
      />
    );
  }
  if (isScenarioSummaryData(data)) {
    return <ScenarioSummary data={data} />;
  }
  return null;
}
