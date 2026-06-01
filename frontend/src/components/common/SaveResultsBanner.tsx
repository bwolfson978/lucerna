"use client";

interface SaveResultsBannerProps {
  show: boolean;
  signInButton: React.ReactNode;
  onDismiss: () => void;
}

export function SaveResultsBanner({ show, signInButton, onDismiss }: SaveResultsBannerProps) {
  if (!show) return null;

  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-text-primary">Save your analysis</span>
        <span className="text-body-sm text-text-secondary">
          Sign in to revisit this scenario and compare conversion schedules over time.
        </span>
      </div>
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
    </div>
  );
}
