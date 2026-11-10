"use client";

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import posthog from "posthog-js";
import { CheckIcon, CopyIcon, PencilIcon } from "@/components/common/icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface UserMessageProps {
  text: string;
  /** Rerun the conversation from this message with new text. Omit when it can't be edited. */
  onEdit?: (text: string) => void;
  /** A reply is on its way: editing waits until it's done. */
  busy?: boolean;
  /** This message is open for editing (one at a time, so the thread holds it). */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  className?: string;
}

/**
 * One of the person's messages, with Copy and Edit below it (shown on hover, or always
 * on touch screens). Editing turns the bubble into a text box; sending it replaces the
 * message and everything after it, and the assistant answers again.
 */
export const UserMessage = forwardRef<HTMLDivElement, UserMessageProps>(function UserMessage(
  { text, onEdit, busy = false, editing, onEditingChange, className },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn("group flex scroll-mt-24 flex-col items-end", className)}
      data-testid="user-message"
    >
      {editing && onEdit ? (
        <EditBox
          initial={text}
          busy={busy}
          onCancel={() => onEditingChange(false)}
          onSend={(next) => {
            onEditingChange(false);
            onEdit(next);
          }}
        />
      ) : (
        <>
          <div
            data-tour="user-bubble"
            className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-pine-deep px-4 py-2.5 text-[15.5px] leading-relaxed text-[#f5f2ea]"
          >
            {text}
          </div>
          <MessageActions
            text={text}
            onEdit={onEdit && !busy ? () => onEditingChange(true) : undefined}
          />
        </>
      )}
    </div>
  );
});

function MessageActions({ text, onEdit }: { text: string; onEdit?: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      posthog.capture("agent_message_copied");
    } catch {
      // Clipboard blocked (insecure context, permissions): the text stays selectable.
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "mt-1 flex items-center gap-0.5 transition-opacity duration-150 motion-reduce:transition-none",
          // Mouse and trackpad: shown while the pointer is over the message or a button
          // has focus. Touch screens have no hover, so they always show.
          "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
          copied && "[@media(hover:hover)]:opacity-100"
        )}
      >
        <ActionButton label={copied ? "Copied" : "Copy"} onClick={() => void copy()}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </ActionButton>
        {onEdit && (
          <ActionButton label="Edit" onClick={onEdit}>
            <PencilIcon />
          </ActionButton>
        )}
      </div>
    </TooltipProvider>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 hover:bg-paper-warm hover:text-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine-mid/30"
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

function EditBox({
  initial,
  busy,
  onCancel,
  onSend,
}: {
  initial: string;
  busy: boolean;
  onCancel: () => void;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Start with the cursor after the text, as if the person had clicked at its end.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Grow with the text, up to about ten lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [value]);

  const canSend = value.trim() !== "" && !busy;
  const submit = () => {
    if (canSend) onSend(value.trim());
  };

  return (
    <form
      className="w-full rounded-[20px] border border-border bg-white p-3 shadow-card sm:max-w-[85%]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="edit-message" className="sr-only">
        Edit your message
      </label>
      <textarea
        id="edit-message"
        ref={textareaRef}
        rows={1}
        value={value}
        maxLength={2000}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          // Enter sends on devices with a hardware keyboard; Shift+Enter adds a line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            const coarse = window.matchMedia?.("(pointer: coarse)").matches;
            if (!coarse) {
              e.preventDefault();
              submit();
            }
          }
        }}
        className="block w-full resize-none bg-transparent px-1 text-[16px] leading-relaxed text-text-primary outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <p className="mr-auto px-1 text-[12.5px] text-text-tertiary">
          The conversation reruns from here.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[36px] rounded-full border border-border px-4 text-[14px] font-semibold text-text-secondary transition-colors duration-200 hover:border-pine-mid/40 hover:text-pine-deep"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSend}
            className="min-h-[36px] rounded-full bg-pine-deep px-4 text-[14px] font-semibold text-[#f5f2ea] transition-colors duration-200 hover:bg-pine disabled:cursor-not-allowed disabled:bg-paper-deep disabled:text-text-tertiary"
          >
            Send
          </button>
        </div>
      </div>
    </form>
  );
}
