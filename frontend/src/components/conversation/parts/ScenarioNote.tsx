"use client";

import type { ScenarioDraft } from "@/lib/scenario/draft";
import { detailChanges } from "@/lib/scenario/changes";
import { useConversationContext } from "../ConversationContext";

interface ScenarioNoteProps {
  /** The scenario as the assistant recorded it. */
  draft: ScenarioDraft;
  /** The scenario the previous note in the conversation recorded (an empty one at first). */
  previous: ScenarioDraft;
}

/**
 * The assistant recorded the scenario: one line saying so, in place of the scenario
 * itself, which lives in the scenario panel (a sheet on phones) where it stays current.
 */
export function ScenarioNote({ draft, previous }: ScenarioNoteProps) {
  const { showScenario } = useConversationContext();
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-full border border-border bg-card py-1.5 pl-2 pr-1.5 text-body-sm text-text-secondary"
      data-testid="scenario-note"
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-light text-[11px] font-bold text-pine-mid"
        >
          ✓
        </span>
        {noteText(draft, previous)}
      </span>
      {showScenario && (
        <button
          type="button"
          onClick={showScenario}
          className="min-h-[32px] rounded-full px-3 font-semibold text-pine transition-colors duration-200 hover:bg-paper-deep"
        >
          Review
        </button>
      )}
    </div>
  );
}

function noteText(draft: ScenarioDraft, previous: ScenarioDraft): string {
  const { count, allNew } = detailChanges(previous, draft);
  if (count === 0) return "Your scenario is ready to check";
  const details = `${count} ${count === 1 ? "detail" : "details"}`;
  return allNew ? `Added ${details} to your scenario` : `Updated ${details} in your scenario`;
}
