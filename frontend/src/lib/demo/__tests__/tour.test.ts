import posthog from "posthog-js";
import type { Config, DriveStep } from "driver.js";
import { createDemoTour } from "../tour";

/** A stand-in for Driver.js that records what it was asked to highlight. */
const shown: { config: Config; step: DriveStep; destroyed: boolean }[] = [];

vi.mock("driver.js", () => ({
  driver: (config: Config) => {
    const entry = { config, step: {} as DriveStep, destroyed: false };
    const instance = {
      highlight: (step: DriveStep) => {
        entry.step = step;
        shown.push(entry);
        config.onHighlighted?.(undefined, step, {} as never);
      },
      refresh: vi.fn(),
      destroy: () => {
        entry.destroyed = true;
        config.onDestroyed?.(undefined, entry.step, {} as never);
      },
    };
    return instance;
  },
}));
vi.mock("driver.js/dist/driver.css", () => ({}));
vi.mock("../tour.css", () => ({}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

const capture = vi.mocked(posthog.capture);

function mount(html: string, height = 100) {
  document.body.innerHTML = html;
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      width: 300,
      height,
      top: 500,
      bottom: 500 + height,
    } as DOMRect);
    Object.defineProperty(el, "offsetHeight", { value: height, configurable: true });
  }
}

/** Waits for the next step to be on screen and returns it. */
async function nextShown(count: number) {
  await vi.waitFor(() => expect(shown).toHaveLength(count), { timeout: 3000 });
  return shown[count - 1];
}

const clickNext = (entry: (typeof shown)[number]) =>
  entry.step.popover?.onNextClick?.(undefined, entry.step, {} as never);

beforeEach(() => {
  shown.length = 0;
  capture.mockClear();
  window.scrollTo = vi.fn() as never;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("demo tour", () => {
  it("spotlights the step for a stop and waits for Next", async () => {
    mount(`<div data-tour="user-bubble">Hi, I'm Margaret</div>`);
    const tour = createDemoTour();
    let moved = false;
    const paused = tour.pause({ exchange: 0, at: "asked", last: false }).then(() => {
      moved = true;
    });

    const entry = await nextShown(1);
    expect(entry.step.element).toBe(document.querySelector("[data-tour=user-bubble]"));
    expect(entry.step.popover).toMatchObject({
      title: "Margaret describes her situation",
      nextBtnText: "Next",
      progressText: "1 of 5",
    });
    expect(moved).toBe(false);
    expect(capture).toHaveBeenCalledWith("demo_tour_step_shown", {
      step: "situation",
      step_number: 1,
    });

    clickNext(entry);
    await paused;
    expect(entry.destroyed).toBe(true);
    expect(capture).not.toHaveBeenCalledWith("demo_tour_skipped", expect.anything());
  });

  it("does not hold up stops that have no step", async () => {
    const tour = createDemoTour();
    await tour.pause({ exchange: 0, at: "before", last: false });
    expect(shown).toHaveLength(0);
  });

  it("closing the popover skips the rest of the tour", async () => {
    mount(`<div data-tour="user-bubble">Hi</div><form data-tour="composer"></form>`);
    const tour = createDemoTour();
    const paused = tour.pause({ exchange: 0, at: "asked", last: false });
    const entry = await nextShown(1);

    // Driver calls onDestroyed when the visitor presses the X or Escape.
    entry.config.onDestroyed?.(undefined, entry.step, {} as never);
    await paused;
    expect(capture).toHaveBeenCalledWith("demo_tour_skipped", {
      step: "situation",
      step_number: 1,
    });

    await tour.pause({ exchange: 1, at: "before", last: true });
    expect(shown).toHaveLength(1);
  });

  it("end() closes the open step and lets playback run on", async () => {
    mount(`<form data-tour="composer"></form>`);
    const tour = createDemoTour();
    const paused = tour.pause({ exchange: 1, at: "before", last: true });
    const entry = await nextShown(1);
    expect(entry.step.popover?.nextBtnText).toBe("Run the numbers");

    tour.end();
    await paused;
    expect(entry.destroyed).toBe(true);
    await tour.pause({ exchange: 1, at: "answered", last: true });
    expect(shown).toHaveLength(1);
  });

  it("waits for a result card to load, reads it from the top and docks the popover on phones", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    mount(`<div data-testid="mcp-app" data-status="loading" data-sized="false"></div>`, 1200);
    const card = document.querySelector<HTMLElement>("[data-testid=mcp-app]")!;
    const tour = createDemoTour();
    const paused = tour.pause({ exchange: 1, at: "card", last: true });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(shown).toHaveLength(0);
    // Off screen the card's frame can't report its height, so it was brought into view.
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 404, behavior: "smooth" });

    card.dataset.status = "ready";
    card.dataset.sized = "true";
    const entry = await nextShown(1);
    expect(entry.config.popoverClass).toBe("demo-tour demo-tour-docked");
    expect(entry.config.disableActiveInteraction).toBe(false);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 404, behavior: "auto" });

    clickNext(entry);
    await paused;
  });

  it("reports the tour as completed on the last step", async () => {
    mount(`<form data-tour="composer"></form>`);
    const tour = createDemoTour();
    const paused = tour.pause({ exchange: 1, at: "answered", last: true });
    const entry = await nextShown(1);
    expect(entry.step.popover?.nextBtnText).toBe("Done");
    clickNext(entry);
    await paused;
    expect(capture).toHaveBeenCalledWith("demo_tour_completed");
  });
});
