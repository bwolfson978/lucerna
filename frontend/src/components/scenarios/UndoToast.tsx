"use client";

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** How long the drain bar takes; match the page's undo window. */
  durationMs?: number;
}

/** "Deleted ..." with Undo, shown for the undo window after a delete. */
export function UndoToast({ message, onUndo, onDismiss, durationMs = 8000 }: UndoToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-dialog-rise fixed bottom-4 left-4 right-4 z-[35] overflow-hidden rounded-[12px] border border-pine-line bg-pine-deep text-[#f5f2ea] shadow-[0_16px_40px_-12px_rgba(11,29,21,0.4)] md:bottom-7 md:left-auto md:right-6 md:w-[360px]"
    >
      <div className="flex items-center gap-2.5 py-2.5 pl-4 pr-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-sage"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-body-sm">{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex h-11 items-center gap-1.5 rounded-sm border border-pine-mist px-3 text-[13px] font-semibold transition-colors duration-200 hover:bg-[#f5f2ea]/10 md:h-8"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
          Undo
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="inline-flex h-11 w-11 items-center justify-center rounded-sm text-pine-haze transition-colors duration-200 hover:bg-[#f5f2ea]/10 hover:text-[#f5f2ea] md:h-8 md:w-8"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div
        className="animate-drain h-[3px] bg-sage"
        style={{ "--drain-ms": `${durationMs}ms` } as React.CSSProperties}
      />
    </div>
  );
}
