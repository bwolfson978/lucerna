"use client";

import { cn } from "@/lib/utils";
import { useMethodology } from "./MethodologyContext";

interface InfoTriggerProps {
  label: string;
  sectionId: string;
  triggerId: string;
  className?: string;
}

export function InfoTrigger({ label, sectionId, triggerId, className }: InfoTriggerProps) {
  const { activeTrigger, openSidebar } = useMethodology();
  const isActive = activeTrigger === triggerId;

  return (
    <button
      type="button"
      onClick={() => openSidebar(sectionId, triggerId)}
      className={cn(
        "inline-flex items-center gap-1.5",
        "whitespace-nowrap text-xs font-medium",
        "rounded-md px-2.5 py-1",
        "border border-transparent",
        "transition-all duration-200",
        isActive
          ? "border-accent/30 bg-accent/15 text-accent"
          : "text-text-tertiary hover:border-accent/15 hover:bg-accent/15 hover:text-accent",
        className
      )}
      aria-label={label}
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 7v4M8 5.5v0" />
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
