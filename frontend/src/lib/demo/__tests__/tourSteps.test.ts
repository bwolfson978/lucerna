import type { ReplayStop } from "@/hooks/useConversation";
import { findTarget, stepForStop, TOUR_STEPS } from "../tourSteps";

const stop = (exchange: number, at: ReplayStop["at"], last: boolean): ReplayStop => ({
  exchange,
  at,
  last,
});

describe("demo tour steps", () => {
  it("explains Margaret's two exchanges in five steps, in order", () => {
    const stops = [
      stop(0, "before", false),
      stop(0, "asked", false),
      stop(0, "answered", false),
      stop(1, "before", true),
      stop(1, "asked", true),
      stop(1, "card", true),
      stop(1, "answered", true),
    ];
    const shown = stops.map(stepForStop).filter(Boolean);
    expect(shown).toEqual(TOUR_STEPS.map((s) => s.id));
  });

  it("skips exchanges in the middle and still ends on the last one", () => {
    expect(stepForStop(stop(1, "before", false))).toBeNull();
    expect(stepForStop(stop(1, "answered", false))).toBeNull();
    expect(stepForStop(stop(2, "answered", true))).toBe("yours");
    expect(stepForStop(stop(0, "answered", true))).toBe("yours");
  });

  it("keeps the copy plain: no em dashes and no advice", () => {
    for (const step of TOUR_STEPS) {
      const copy = `${step.title} ${step.body} ${step.button}`;
      expect(copy).not.toContain("—");
      expect(copy.toLowerCase()).not.toContain("you should");
    }
  });

  it("points at the last matching part that is on screen", () => {
    document.body.innerHTML = `
      <div data-testid="scenario-panel" id="hidden-panel"></div>
      <button data-tour="scenario-bar" id="bar-1"></button>
      <button data-tour="scenario-bar" id="bar-2"></button>`;
    const size = (el: Element, width: number) =>
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ width, height: width } as DOMRect);
    size(document.getElementById("hidden-panel")!, 0); // the panel is hidden on phones
    size(document.getElementById("bar-1")!, 300);
    size(document.getElementById("bar-2")!, 300);

    const recorded = TOUR_STEPS.find((s) => s.id === "recorded")!;
    expect(findTarget(recorded)?.id).toBe("bar-2");
    expect(findTarget(TOUR_STEPS[0])).toBeNull();
    document.body.innerHTML = "";
  });
});
