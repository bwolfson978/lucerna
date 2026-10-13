"use client";

import { cn } from "@/lib/utils";

export type WorkspaceMode = "conversation" | "form";

const OPTIONS: { value: WorkspaceMode; label: string }[] = [
  { value: "conversation", label: "Discuss" },
  { value: "form", label: "My numbers" },
];

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How do you want to enter your scenario?"
      className="inline-flex w-full rounded-full border border-border bg-paper-warm p-1 sm:w-auto sm:self-start"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-[40px] flex-1 rounded-full px-5 text-[14.5px] font-semibold transition-all duration-200 sm:flex-none",
              selected
                ? "bg-pine-deep text-[#f5f2ea] shadow-[0_8px_20px_-12px_rgba(11,29,21,0.6)]"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
