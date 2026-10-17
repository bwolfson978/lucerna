"use client";

import Link from "next/link";

export type SaveBannerState = "prompt" | "saving" | "saved";

interface SaveResultsBannerProps {
  show: boolean;
  state?: SaveBannerState;
  signInButton: React.ReactNode;
  onDismiss: () => void;
}

export function SaveResultsBanner({
  show,
  state = "prompt",
  signInButton,
  onDismiss,
}: SaveResultsBannerProps) {
  if (!show) return null;

  if (state === "saved") {
    return (
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-optimal/10 text-sm text-optimal">
            ✓
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-body font-medium text-text-primary">Analysis saved</span>
            <span className="text-body-sm text-text-secondary">
              Come back any time to reload this scenario.
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/my-scenarios"
            className="text-body-sm font-medium text-accent transition-colors duration-300 hover:text-accent-hover"
          >
            View your scenarios →
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="text-body-sm text-text-tertiary transition-colors duration-300 hover:text-text-secondary"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-text-primary">
          {state === "saving" ? "Saving your analysis..." : "Save your analysis"}
        </span>
        <span className="text-body-sm text-text-secondary">
          A free account keeps this scenario so you can reopen it here or from Claude and ChatGPT.
        </span>
      </div>
      {state !== "saving" && (
        <div className="flex shrink-0 items-center gap-3">
          {signInButton}
          <button
            type="button"
            onClick={onDismiss}
            className="text-body-sm text-text-tertiary transition-colors duration-300 hover:text-text-secondary"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
