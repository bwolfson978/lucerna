"use client";

import Link from "next/link";
import type { SaveStatus } from "@/hooks/useSaveScenario";
import { cn } from "@/lib/utils";

/** "Save scenario", then where it went. Presentational: state comes from useSaveScenario. */
export function SaveScenarioButton({
  status,
  onSave,
  className,
}: {
  status: SaveStatus;
  onSave: () => void;
  className?: string;
}) {
  if (status.state === "saved") {
    return (
      <p role="status" className={cn("text-body-sm text-text-secondary", className)}>
        Saved as <span className="font-medium text-text-primary">{status.name}</span>.{" "}
        <Link
          href="/scenarios"
          className="text-pine underline decoration-border underline-offset-4 hover:decoration-pine"
        >
          My scenarios
        </Link>
      </p>
    );
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <button
        type="button"
        onClick={onSave}
        disabled={status.state === "saving"}
        className="btn-ghost min-h-[40px] px-5 py-2 text-[14.5px] disabled:opacity-60"
      >
        {status.state === "saving" ? "Saving…" : "Save scenario"}
      </button>
      {status.state === "error" && (
        <p role="alert" className="text-body-sm text-negative">
          {status.message}
        </p>
      )}
    </div>
  );
}
