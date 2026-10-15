"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  /** Extra content under the description (a list of names, a confirm field). */
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Keeps the confirm button disabled, for example until a phrase is typed. */
  confirmDisabled?: boolean;
  /** Disables both buttons while the action runs. */
  busy?: boolean;
  /** "warning" shows a triangle instead of the trash can. */
  icon?: "trash" | "warning";
}

export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/**
 * A modal confirm step for destructive actions. Focus starts on Cancel, Escape and the
 * scrim cancel, Tab stays inside, and focus returns to where it was on close.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled,
  busy,
  icon = "trash",
}: ConfirmDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      returnTo?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onCancel();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), a[href]"
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-pine-deep/35 px-4 pb-4 pt-[72px] md:pt-[120px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        onKeyDown={onKeyDown}
        className="animate-dialog-rise w-full max-w-[480px] overflow-hidden rounded-md border border-border bg-white shadow-elevated"
      >
        <div className="flex flex-col gap-3 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-negative/10 text-negative">
            {icon === "warning" ? <WarningIcon /> : <TrashIcon size={20} />}
          </div>
          <h2
            id={`${id}-title`}
            className="mt-1 text-[18px] font-semibold leading-snug text-text-primary"
          >
            {title}
          </h2>
          <div id={`${id}-desc`} className="text-body-sm text-text-secondary">
            {description}
          </div>
          {children}
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 border-t border-border bg-paper px-6 py-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] rounded-full border border-border bg-transparent px-5 text-body-sm font-semibold text-text-primary transition-colors duration-200 hover:border-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled || busy}
            className={cn(
              "min-h-[44px] rounded-full bg-negative px-5 text-body-sm font-semibold text-white transition-colors duration-200 hover:bg-negative/90",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A bordered list inside a dialog: the names being deleted, or what an action removes. */
export function DialogList({ children }: { children: ReactNode }) {
  return (
    <ul className="m-0 list-none rounded-[10px] border border-border bg-paper p-0 [&>li+li]:border-t [&>li+li]:border-border [&>li]:flex [&>li]:justify-between [&>li]:gap-3 [&>li]:px-3 [&>li]:py-[9px] [&>li]:text-[13px] [&>li]:font-medium [&>li]:text-text-primary">
      {children}
    </ul>
  );
}
