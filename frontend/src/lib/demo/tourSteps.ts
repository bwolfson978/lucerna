/**
 * The guided tour of the /demo conversation: which step explains each stop in the
 * replay, what it says and what it points at. Kept apart from the overlay library
 * (see tour.ts) so the steps can be tested and reused without it.
 */

import type { ReplayStop } from "@/hooks/useConversation";

export type TourStepId = "situation" | "recorded" | "run" | "result" | "yours";

export interface TourStep {
  id: TourStepId;
  title: string;
  body: string;
  /** Label of the button that moves on. */
  button: string;
  /** Selectors for what the step points at; the first one that is on screen wins. */
  targets: string[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "situation",
    title: "Margaret describes her situation",
    body: "She writes it in plain words, the way she would tell a friend. There are no forms to fill in first.",
    button: "Next",
    targets: ["[data-tour=user-bubble]"],
  },
  {
    id: "recorded",
    title: "Her numbers are recorded",
    body: "The assistant turns what she said into a scenario she can check before anything is calculated.",
    button: "Next",
    targets: ["[data-testid=scenario-panel]", "[data-tour=scenario-bar]"],
  },
  {
    id: "run",
    title: "She confirms it",
    body: "Nothing is calculated until she says the scenario is right. Tap the button to send her reply.",
    button: "Run the numbers",
    targets: ["[data-tour=composer]"],
  },
  {
    id: "result",
    title: "Her results",
    body: "Her estimated lifetime tax savings, and how each year's conversion fills the lower tax brackets. Drag the slider to try converting less.",
    button: "Next",
    targets: ["[data-testid=mcp-app]"],
  },
  {
    id: "yours",
    title: "Your turn",
    body: "Ask a follow-up question about Margaret's results, or start again with your own numbers.",
    button: "Done",
    targets: ["[data-tour=composer]"],
  },
];

/** The step that explains a stop in the replay, if any. */
export function stepForStop(stop: ReplayStop): TourStepId | null {
  if (stop.at === "card") return "result";
  if (stop.exchange === 0) {
    if (stop.at === "asked") return "situation";
    if (stop.at === "answered") return stop.last ? "yours" : "recorded";
    return null;
  }
  if (!stop.last) return null;
  if (stop.at === "before") return "run";
  if (stop.at === "answered") return "yours";
  return null;
}

/** The last element on the page matching one of the step's targets that is on screen. */
export function findTarget(step: TourStep, root: ParentNode = document): HTMLElement | null {
  for (const selector of step.targets) {
    const matches = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isShown);
    if (matches.length > 0) return matches[matches.length - 1];
  }
  return null;
}

function isShown(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
