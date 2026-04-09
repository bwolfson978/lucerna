"use client";

import { cn } from "@/lib/utils";
import { useMethodologyOptional } from "./MethodologyContext";

export function HowItWorksButton() {
  const ctx = useMethodologyOptional();
  if (!ctx) return null;
  const { isOpen, openSidebar } = ctx;

  return (
    <button
      type="button"
      onClick={() => openSidebar()}
      className={cn(
        "inline-flex items-center gap-1.5",
        "text-sm font-medium",
        "px-3.5 py-1.5 rounded-lg",
        "border transition-all duration-200",
        isOpen
          ? "text-accent bg-accent/15 border-accent/30"
          : "text-text-secondary border-glass-border hover:text-accent hover:border-accent/30"
      )}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M6.5 6.5a1.5 1.5 0 1 1 1.5 1.5v1.5M8 11.5v0" />
      </svg>
      <span className="hidden min-[400px]:inline">How does it work?</span>
    </button>
  );
}
