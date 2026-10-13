import type { ReactNode } from "react";

export interface Step {
  title: ReactNode;
  /** A short line under the title: years, amounts, an age. */
  meta?: ReactNode;
  body?: ReactNode;
}

/**
 * Numbered steps joined by a dotted line, for an ordered sequence where each
 * step needs a sentence of its own (the phases of a conversion schedule).
 */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col" data-ui="steps">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} className="grid grid-cols-[28px_1fr] gap-x-4">
            <div className="flex flex-col items-center" aria-hidden>
              <span className="border-pine/70 text-pine flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[13px]">
                {i + 1}
              </span>
              {!last && (
                <span className="border-pine-mist mt-2 w-0 flex-1 border-l-2 border-dotted" />
              )}
            </div>
            <div className={last ? "min-w-0" : "min-w-0 pb-6"}>
              <div className="text-ink pt-[2px] font-semibold">{step.title}</div>
              {step.meta && (
                <div className="text-ink-muted mt-1 font-mono text-[13px] italic">{step.meta}</div>
              )}
              {step.body && <p className="mt-2">{step.body}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
