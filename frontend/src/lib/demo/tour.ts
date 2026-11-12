/**
 * Runs the /demo tour: at each stop in the replay it spotlights the part of the page the
 * step is about (Driver.js draws the overlay and places the popover) and waits for the
 * visitor to move on. Closing the tour lets the rest of the conversation play through.
 */

import "driver.js/dist/driver.css";
import "./tour.css";
import posthog from "posthog-js";
import type { Driver } from "driver.js";
import type { ReplayStop } from "@/hooks/useConversation";
import { findTarget, stepForStop, TOUR_STEPS, type TourStep } from "./tourSteps";

/** Room kept clear above a scrolled-to element for the sticky header. */
const HEADER_ROOM = 96;
const PHONE = "(max-width: 639px)";

export interface DemoTour {
  /** Explain this stop, resolving when the visitor moves on (at once if there is nothing to say). */
  pause: (stop: ReplayStop) => Promise<void>;
  /** Close the tour and let playback run on; safe to call at any time. */
  end: () => void;
}

export function createDemoTour(): DemoTour {
  let ended = false;
  let active: { driver: Driver; finish: () => void } | null = null;
  let stopFollowing: (() => void) | null = null;

  const close = () => {
    const current = active;
    active = null;
    current?.driver.destroy();
    current?.finish();
  };

  const end = () => {
    ended = true;
    stopFollowing?.();
    close();
  };

  const show = async (step: TourStep): Promise<void> => {
    const { driver } = await import("driver.js");
    // Browsers hold back a card's frame while it is off screen, so it can't report its
    // height from there: bring a card that is still loading into view first.
    const early = findTarget(step);
    if (early && isLoading(early)) scrollUnderHeader(early, "smooth");
    const target = await waitForTarget(step);
    if (ended || !target) return;
    const index = TOUR_STEPS.indexOf(step);
    const phone = window.matchMedia(PHONE).matches;
    // A card taller than the screen can't be centred: its top goes under the header
    // instead. On phones that leaves no room beside it, so the popover sits at the
    // bottom of the screen (see .demo-tour-docked).
    const tall = target.getBoundingClientRect().height > window.innerHeight * 0.6;
    const docked = phone && tall;
    posthog.capture("demo_tour_step_shown", { step: step.id, step_number: index + 1 });

    await new Promise<void>((resolve) => {
      let moved = false;
      const instance = driver({
        animate: true,
        smoothScroll: !tall,
        allowClose: true,
        overlayClickBehavior: "none",
        overlayColor: "#0e1f17",
        overlayOpacity: 0.55,
        stagePadding: 8,
        stageRadius: 18,
        popoverOffset: 14,
        // The highlighted part stays usable (the result card's slider, for one).
        disableActiveInteraction: false,
        popoverClass: docked ? "demo-tour demo-tour-docked" : "demo-tour",
        closeBtnLabel: "Skip the tour",
        // Enter moves on; Driver would otherwise focus the close button.
        onPopoverRender: (popover) =>
          setTimeout(() => popover.nextButton.focus({ preventScroll: true })),
        onHighlighted: () => {
          if (!tall) return;
          // Driver centres what it highlights; a tall card reads better from its top.
          scrollUnderHeader(target, "auto");
          instance.refresh();
        },
        // Escape (the X is handled below): the visitor is done with the tour.
        onDestroyed: () => {
          if (active?.driver === instance) skip();
        },
      });
      const skip = () => {
        if (moved) return;
        ended = true;
        posthog.capture("demo_tour_skipped", { step: step.id, step_number: index + 1 });
        close();
      };
      active = { driver: instance, finish: resolve };
      instance.highlight({
        element: target,
        popover: {
          title: step.title,
          description: step.body,
          side: phone ? "top" : sideFor(step),
          align: "center",
          showButtons: ["next", "close"],
          nextBtnText: step.button,
          doneBtnText: step.button,
          showProgress: true,
          progressText: `${index + 1} of ${TOUR_STEPS.length}`,
          onCloseClick: skip,
          onNextClick: () => {
            moved = true;
            if (index === TOUR_STEPS.length - 1) posthog.capture("demo_tour_completed");
            close();
          },
        },
      });
    });
  };

  return {
    end,
    pause: async (stop) => {
      if (ended) return;
      const id = stepForStop(stop);
      const step = TOUR_STEPS.find((s) => s.id === id);
      if (!step) return;
      stopFollowing?.();
      await show(step);
      // The reply is written below what was just explained (her message, the result
      // card): keep it in view as it arrives.
      const above = FOLLOW_BELOW[step.id];
      if (above && !ended) stopFollowing = followReply(above);
    },
  };
}

function scrollUnderHeader(el: HTMLElement, behavior: ScrollBehavior) {
  window.scrollTo({
    top: window.scrollY + el.getBoundingClientRect().top - HEADER_ROOM,
    behavior,
  });
}

function sideFor(step: TourStep): "left" | "top" | "bottom" {
  if (step.id === "recorded") return "left";
  if (step.id === "situation") return "bottom";
  return "top";
}

/**
 * The step's target once it is on screen, has finished loading (a result card) and has
 * kept the same height for a moment, so the spotlight is drawn around its final size.
 */
async function waitForTarget(step: TourStep, timeout = 6000): Promise<HTMLElement | null> {
  const start = Date.now();
  let height = -1;
  let steadySince = start;
  for (;;) {
    const target = findTarget(step);
    const now = Date.now();
    const current = target && !isLoading(target) ? target.offsetHeight : -1;
    if (current !== height) {
      height = current;
      steadySince = now;
    }
    if (target && height > 0 && now - steadySince >= 300) return target;
    if (now - start > timeout) return target;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** A result card that is still loading or hasn't taken its real height yet. */
function isLoading(target: HTMLElement): boolean {
  const { status, sized } = target.dataset;
  return status === "loading" || (status === "ready" && sized === "false");
}

/** After these steps a reply streams in below the part they pointed at. */
const FOLLOW_BELOW: Partial<Record<TourStep["id"], string>> = {
  situation: "[data-tour=user-bubble]",
  result: "[data-testid=mcp-app]",
};

/**
 * As the reply grows below the last element matching `above`, scroll down with it until
 * the end of that element sits near the top of the screen, then leave the page alone.
 * Stops for good when the visitor scrolls themselves.
 */
function followReply(above: string): () => void {
  const cards = document.querySelectorAll<HTMLElement>(above);
  const card = cards[cards.length - 1];
  if (!card || typeof ResizeObserver === "undefined") return () => {};
  const follow = () => {
    const wanted = window.scrollY + card.getBoundingClientRect().bottom - HEADER_ROOM;
    const furthest = document.documentElement.scrollHeight - window.innerHeight;
    const top = Math.min(wanted, furthest);
    if (top > window.scrollY + 1) window.scrollTo({ top });
  };
  const observer = new ResizeObserver(follow);
  observer.observe(document.body);
  const stop = () => {
    observer.disconnect();
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchmove", stop);
    window.removeEventListener("keydown", stop);
  };
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchmove", stop, { passive: true });
  window.addEventListener("keydown", stop);
  follow();
  return stop;
}
