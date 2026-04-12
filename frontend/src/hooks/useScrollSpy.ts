"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks which section is currently in the viewport.
 * Returns the id of the topmost visible section.
 */
export function useScrollSpy(sectionIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Track which sections are currently intersecting
    const visibleSections = new Map<string, IntersectionObserverEntry>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target.id, entry);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }

        // Pick the topmost visible section (lowest boundingClientRect.top)
        let topmost: string | null = null;
        let topY = Infinity;
        for (const [id, entry] of visibleSections) {
          const top = entry.boundingClientRect.top;
          if (top < topY) {
            topY = top;
            topmost = id;
          }
        }

        if (topmost) {
          setActiveId(topmost);
        }
      },
      {
        // Bias toward the top of the viewport
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    // Observe all sections
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) {
        observerRef.current.observe(el);
      }
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [sectionIds]);

  return activeId;
}
