"use client";

import posthog from "posthog-js";
import { RUN_MESSAGE, ScenarioSummary } from "@lucerna/ui";
import { isDraftReady, type DraftPatch, type ScenarioDraft } from "@/lib/scenario/draft";
import { summaryData } from "@/lib/results/viewData";
import { useConversationContext } from "../ConversationContext";

interface ScenarioSummaryCardProps {
  /** Values as they were when the assistant showed the card. */
  snapshot: ScenarioDraft;
  /** Latest summary not yet run: live values, editable, with the Run button. */
  active: boolean;
}

/**
 * The shared scenario summary (ui/), wired to the live draft. The `record_scenario`
 * View renders the same component read-only in other MCP hosts; this host shows its
 * own because edits here update the draft and the form directly.
 */
export function ScenarioSummaryCard({ snapshot, active }: ScenarioSummaryCardProps) {
  const { draft: liveDraft, editDraft, send, streaming, openForm } = useConversationContext();
  const draft = active ? liveDraft : snapshot;
  const editable = active && !streaming;

  return (
    <div data-testid="scenario-summary">
      <ScenarioSummary
        data={summaryData(draft)}
        badge={active ? undefined : "Confirmed"}
        onEdit={editable ? (patch) => editDraft(patch as DraftPatch) : undefined}
        onOpenForm={editable ? openForm : undefined}
        onRun={
          active
            ? () => {
                posthog.capture("scenario_confirmed");
                send(RUN_MESSAGE);
              }
            : undefined
        }
        runDisabled={streaming || !isDraftReady(draft)}
        hint="Tap a value to change it. Nothing runs until you say so."
      />
    </div>
  );
}
