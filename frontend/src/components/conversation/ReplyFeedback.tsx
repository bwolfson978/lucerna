"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CloseIcon, ThumbDownIcon, ThumbUpIcon } from "@/components/common/icons";
import { Select } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RatingReason, ReplyRating } from "@/lib/agent/types";
import { cn } from "@/lib/utils";

export const RATING_REASONS: { value: RatingReason; label: string }[] = [
  { value: "numbers_look_wrong", label: "Numbers look wrong" },
  { value: "did_not_answer", label: "Didn't answer my question" },
  { value: "hard_to_follow", label: "Hard to follow" },
  { value: "ignored_something", label: "Ignored something I said" },
  { value: "something_else", label: "Something else" },
];

export const MAX_NOTE = 1000;

interface ReplyFeedbackProps {
  rating?: ReplyRating;
  /** Save the rating (or clear it with null). Called on the tap, and again on Send. */
  onRate: (rating: ReplyRating | null) => void;
  /** Start with the form open (stories and screenshots). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Thumbs up and down under one of the assistant's replies. A tap saves the rating at
 * once and opens a short optional form: a dialog on larger screens, a sheet from the
 * bottom on phones. Tapping the picked thumb again clears the rating.
 */
export function ReplyFeedback({
  rating,
  onRate,
  defaultOpen = false,
  className,
}: ReplyFeedbackProps) {
  const [open, setOpen] = useState(defaultOpen && !!rating);

  const tap = (value: ReplyRating["value"]) => {
    if (rating?.value === value) {
      onRate(null);
      return;
    }
    onRate({ value });
    setOpen(true);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn("-ml-2 flex items-center gap-0.5", className)}
        data-testid="reply-feedback"
      >
        <ThumbButton
          label="Good reply"
          pressed={rating?.value === "up"}
          onClick={() => tap("up")}
          className={rating?.value === "up" ? "text-pine-mid" : undefined}
        >
          <ThumbUpIcon filled={rating?.value === "up"} />
        </ThumbButton>
        <ThumbButton
          label="Bad reply"
          pressed={rating?.value === "down"}
          onClick={() => tap("down")}
          className={rating?.value === "down" ? "text-ink-soft" : undefined}
        >
          <ThumbDownIcon filled={rating?.value === "down"} />
        </ThumbButton>
        {rating && !open && (
          <span className="ml-2 text-[13px] text-text-tertiary" role="status">
            Thanks for the feedback.
          </span>
        )}
      </div>
      {open && rating && (
        <FeedbackDialog
          rating={rating}
          onClose={() => setOpen(false)}
          onSend={(next) => {
            onRate(next);
            setOpen(false);
          }}
        />
      )}
    </TooltipProvider>
  );
}

function ThumbButton({
  label,
  pressed,
  onClick,
  className,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn(
            // 44px touch targets on phones, tighter with a mouse.
            "flex h-11 w-11 items-center justify-center rounded-full text-text-tertiary transition-colors duration-150 md:h-9 md:w-9",
            "hover:bg-paper-deep hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-mid/30",
            className
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-2.5 py-1 text-[12.5px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function FeedbackDialog({
  rating,
  onClose,
  onSend,
}: {
  rating: ReplyRating;
  onClose: () => void;
  onSend: (rating: ReplyRating) => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState<RatingReason | undefined>(rating.reason);
  const [note, setNote] = useState(rating.note ?? "");
  const down = rating.value === "down";

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    // Not on phones: the keyboard would cover the reasons before they're read.
    if (window.matchMedia?.("(min-width: 768px)").matches) noteRef.current?.focus();
    else dialogRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      returnTo?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = [
      ...dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea, input, a[href]"
      ),
    ].filter((el) => el.offsetParent !== null || el === document.activeElement);
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

  const send = () => {
    const text = note.trim();
    onSend({
      value: rating.value,
      ...(down && reason ? { reason } : {}),
      ...(text ? { note: text } : {}),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-pine-deep/35 md:items-center md:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto bg-white shadow-elevated outline-none",
          "animate-sheet-up rounded-t-[20px] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-2",
          "md:animate-dialog-rise md:max-w-[480px] md:gap-[18px] md:rounded-lg md:border md:border-border md:p-6"
        )}
      >
        <div className="flex justify-center py-1 md:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-paper-stone" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2
              id={`${id}-title`}
              className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-text-primary md:text-[24px]"
            >
              {down ? "What went wrong?" : "What worked well?"}
            </h2>
            <p className="text-body-sm text-text-tertiary">
              {down ? "Both fields are optional." : "Optional."} Your rating is already saved.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors duration-150 hover:bg-paper-deep hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-mid/30 md:h-9 md:w-9"
          >
            <CloseIcon />
          </button>
        </div>

        {down && (
          <>
            {/* Larger screens: a dropdown. */}
            <div className="hidden flex-col gap-1.5 md:flex">
              <label
                htmlFor={`${id}-reason`}
                className="text-[13px] font-medium text-text-secondary"
              >
                What kind of problem?
              </label>
              <Select
                id={`${id}-reason`}
                options={RATING_REASONS}
                value={reason ?? ""}
                placeholder="Choose one"
                onChange={(e) => setReason(e.target.value as RatingReason)}
              />
            </div>
            {/* Phones: a list to tap, since a dropdown inside a sheet is fiddly. */}
            <fieldset className="m-0 overflow-hidden rounded-[14px] border border-border p-0 md:hidden">
              <legend className="sr-only">What kind of problem?</legend>
              {RATING_REASONS.map((option, i) => {
                const checked = reason === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-[46px] cursor-pointer items-center justify-between gap-3 px-3.5 text-[15px] font-medium text-text-primary",
                      i > 0 && "border-t border-border",
                      checked && "bg-accent-muted"
                    )}
                  >
                    {option.label}
                    <input
                      type="radio"
                      name={`${id}-reason`}
                      value={option.value}
                      checked={checked}
                      onChange={() => setReason(option.value)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-pine-mid/40 peer-focus-visible:ring-offset-2",
                        checked
                          ? "border-[5px] border-pine-mid"
                          : "border-[1.5px] border-paper-stone"
                      )}
                    />
                  </label>
                );
              })}
            </fieldset>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-[13px] font-medium text-text-secondary">
            Details
          </label>
          <textarea
            ref={noteRef}
            id={`${id}-note`}
            rows={3}
            maxLength={MAX_NOTE}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={down ? "What should the reply have said?" : "What made this reply useful?"}
            className="w-full resize-y rounded-[10px] border border-border bg-white px-3 py-2.5 text-[16px] leading-normal text-text-primary outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-tertiary focus:border-pine focus:ring-2 focus:ring-pine-mid/15 md:text-[15px]"
          />
        </div>

        <p className="text-[12.5px] leading-normal text-text-tertiary">
          We save your note with this conversation so we can review it. Please leave out names and
          account numbers.{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="text-accent underline-offset-2 hover:underline"
          >
            Privacy
          </Link>
        </p>

        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="hidden min-h-[44px] rounded-full px-5 text-[15px] font-semibold text-text-secondary transition-colors duration-200 hover:bg-paper-deep md:block"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            className="min-h-[48px] rounded-full bg-pine-deep px-6 text-[15px] font-semibold text-[#f5f2ea] transition-colors duration-200 hover:bg-pine md:min-h-[44px]"
          >
            <span className="md:hidden">Send feedback</span>
            <span className="hidden md:inline">Send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
