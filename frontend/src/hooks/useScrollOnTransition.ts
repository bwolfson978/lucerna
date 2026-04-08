import { useRef, useEffect, type RefObject } from "react";

/**
 * Auto-scrolls a horizontally-scrollable chart container when a bar
 * activates (zero → non-zero) or deactivates (non-zero → zero).
 *
 * On activation: scrolls the newly-active bar into view.
 * On deactivation: scrolls to the nearest still-active bar.
 * No scroll when bars merely resize (no transition).
 */
export function useScrollOnTransition(
  yearlyConversions: number[],
  scrollRef: RefObject<HTMLDivElement | null>,
  colWidth: number
) {
  const prevActiveRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || colWidth <= 0) return;

    const currentActive = new Set<number>();
    yearlyConversions.forEach((c, i) => {
      if (c > 0) currentActive.add(i);
    });

    // Skip first render — record initial state without scrolling
    if (prevActiveRef.current === null) {
      prevActiveRef.current = currentActive;
      return;
    }

    const prevActive = prevActiveRef.current;

    // Find newly activated indices
    const activated: number[] = [];
    currentActive.forEach((i) => {
      if (!prevActive.has(i)) activated.push(i);
    });

    // Find newly deactivated indices
    const deactivated: number[] = [];
    prevActive.forEach((i) => {
      if (!currentActive.has(i)) deactivated.push(i);
    });

    prevActiveRef.current = currentActive;

    // Determine scroll target
    let scrollTarget: number | null = null;

    if (activated.length > 0) {
      // Scroll to the newly activated bar (pick the last one — the "frontier")
      scrollTarget = Math.max(...activated);
    } else if (deactivated.length > 0 && currentActive.size > 0) {
      // A bar was deactivated — scroll to nearest still-active bar
      const deactivatedIdx = deactivated[0];
      let nearest: number | null = null;
      let nearestDist = Infinity;
      currentActive.forEach((i) => {
        const dist = Math.abs(i - deactivatedIdx);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      });
      scrollTarget = nearest;
    }

    if (scrollTarget === null) return;

    // Check if bar is already visible — don't scroll unnecessarily
    const barLeft = scrollTarget * colWidth;
    const barRight = barLeft + colWidth;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;

    if (barLeft >= viewLeft && barRight <= viewRight) return;

    // Scroll to center the target bar in view
    const targetScroll = barLeft - el.clientWidth / 2 + colWidth / 2;
    el.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: "smooth",
    });
  }, [yearlyConversions, scrollRef, colWidth]);
}
