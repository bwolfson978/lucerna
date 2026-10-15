"use client";

import { cn } from "@/lib/utils";
import { useMethodologyOptional } from "./MethodologyContext";

/**
 * When the "How does it work?" label shows next to the icon:
 * - "auto": once the phone header has room for it (default)
 * - "xl": only on wide screens (the desktop nav, which is tight below xl)
 * - "never": icon only (the desktop nav when signed in, which has the most links)
 */
type LabelMode = "auto" | "xl" | "never";

const SIZE_CLASSES: Record<LabelMode, string> = {
  auto: "w-9 min-[520px]:w-auto min-[520px]:px-3.5",
  xl: "w-9 xl:w-auto xl:px-3.5",
  never: "w-9",
};

const LABEL_CLASSES: Record<LabelMode, string> = {
  auto: "hidden min-[520px]:inline",
  xl: "hidden xl:inline",
  never: "hidden",
};

export function HowItWorksButton({ label = "auto" }: { label?: LabelMode } = {}) {
  const ctx = useMethodologyOptional();
  if (!ctx) return null;
  const { isOpen, openSidebar } = ctx;

  return (
    <button
      type="button"
      onClick={() => openSidebar()}
      aria-label="How does it work?"
      title={label === "auto" ? undefined : "How does it work?"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
        "text-sm font-medium",
        // A circle around the icon where space is tight, a pill once the label fits.
        "h-9 rounded-full",
        SIZE_CLASSES[label],
        "border transition-all duration-200",
        isOpen
          ? "border-pine-mid/30 bg-accent-light text-pine"
          : "border-border text-text-secondary hover:border-pine-mid/40 hover:text-pine"
      )}
    >
      <svg
        className="h-4 w-4 shrink-0"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M6.5 6.5a1.5 1.5 0 1 1 1.5 1.5v1.5M8 11.5v0" />
      </svg>
      <span className={LABEL_CLASSES[label]}>How does it work?</span>
    </button>
  );
}
