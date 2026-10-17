"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Width and offset of the input row inside the full-bleed bar. */
  innerClassName?: string;
  /** Shown above the input row (the scenario bar on phones). */
  top?: ReactNode;
  /**
   * A message to start from: shown in grey italics until edited, and sent as is
   * if the person just presses Send.
   */
  sample?: string;
}

/** Message box pinned to the bottom of the viewport, above the on-screen keyboard. */
export function Composer({
  onSend,
  disabled,
  placeholder,
  innerClassName = "max-w-content",
  top,
  sample,
}: ComposerProps) {
  // The sample arrives after hydration: server HTML has an empty box, so text typed
  // before the page is interactive is never mixed with it.
  const hydrated = useSyncExternalStore(noSubscribe, isClient, isServer);
  const activeSample = hydrated ? sample : undefined;
  const [value, setValue] = useState("");
  const [untouched, setUntouched] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const keyboardOffset = useKeyboardOffset();

  // Grow with the text, up to about five lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  // Follow the sample when it comes and goes (starting over offers it again; a
  // restored draft withdraws it), without touching anything the person typed.
  const [shownSample, setShownSample] = useState<string | undefined>(undefined);
  if (activeSample !== shownSample) {
    setShownSample(activeSample);
    if (activeSample && (value === "" || value === shownSample)) {
      setValue(activeSample);
      setUntouched(true);
    } else if (!activeSample && value !== "" && value === shownSample) {
      setValue("");
    }
  }

  const showingSample = Boolean(activeSample) && untouched && value === activeSample;

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    setUntouched(false);
  }

  return (
    <div
      className="sticky bottom-0 z-20 -mx-default mt-auto border-t border-border bg-paper/90 px-default pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-[14px] sm:-mx-7 sm:px-7"
      style={{ bottom: keyboardOffset }}
    >
      <div className={cn("mx-auto", innerClassName)}>
        {top}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="conversation-input" className="sr-only">
            Message
          </label>
          <div className="relative flex flex-1">
            <textarea
              id="conversation-input"
              ref={textareaRef}
              rows={1}
              value={value}
              maxLength={2000}
              placeholder={placeholder ?? "Ask a follow-up question"}
              onChange={(e) => {
                setValue(e.target.value);
                setUntouched(false);
              }}
              onKeyDown={(e) => {
                // Enter sends on devices with a hardware keyboard; Shift+Enter adds a line.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
                  if (!coarse) {
                    e.preventDefault();
                    submit();
                  }
                }
              }}
              aria-describedby={showingSample ? "conversation-sample-hint" : undefined}
              className={cn(
                "min-h-[44px] flex-1 resize-none rounded-[22px] border border-border bg-white px-4 py-[11px] text-[16px] leading-[1.4] text-text-primary outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-tertiary focus:border-pine focus:ring-2 focus:ring-pine-mid/15",
                activeSample && value !== "" && "pr-11",
                showingSample && "italic text-text-tertiary"
              )}
            />
            {activeSample && value !== "" && (
              <button
                type="button"
                aria-label="Clear text"
                onClick={() => {
                  setValue("");
                  setUntouched(false);
                  textareaRef.current?.focus();
                }}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-paper-warm text-text-secondary transition-colors duration-200 hover:bg-paper-deep"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path
                    d="M3 3l6 6M9 3l-6 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={disabled || value.trim() === ""}
            aria-label="Send"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pine-deep text-[#f5f2ea] transition-colors duration-200",
              "hover:bg-pine disabled:cursor-not-allowed disabled:bg-paper-deep disabled:text-text-tertiary"
            )}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M9 14V4M4.5 8.5 9 4l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
        {showingSample && (
          <p id="conversation-sample-hint" className="mt-1.5 px-1 text-[12.5px] text-text-tertiary">
            Sample message. Change the numbers to yours, or send it as is.
          </p>
        )}
        <p className="mt-1.5 text-center text-[11.5px] text-text-tertiary">
          Educational scenario analysis, not financial advice.
        </p>
      </div>
    </div>
  );
}

const noSubscribe = () => () => {};
const isClient = () => true;
const isServer = () => false;

/**
 * Height of the on-screen keyboard covering the layout viewport (iOS Safari keeps
 * fixed and sticky elements behind it otherwise).
 */
function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(covered > 80 ? covered : 0);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return offset;
}
