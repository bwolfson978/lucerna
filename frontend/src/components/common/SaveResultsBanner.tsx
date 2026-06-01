"use client";

import { useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { GlowButton } from "./GlowButton";

interface SaveResultsBannerProps {
  show: boolean;
}

export function SaveResultsBanner({ show }: SaveResultsBannerProps) {
  const { isLoaded, isSignedIn } = useUser();
  const [dismissed, setDismissed] = useState(false);

  if (!isLoaded || isSignedIn || dismissed || !show) return null;

  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-text-primary">Save your analysis</span>
        <span className="text-body-sm text-text-secondary">
          Sign in to revisit this scenario and compare conversion schedules over time.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <SignInButton mode="modal">
          <GlowButton size="sm">Sign in to save</GlowButton>
        </SignInButton>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-body-sm text-text-tertiary transition-colors duration-300 hover:text-text-secondary"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
