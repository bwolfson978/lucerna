"use client";

/**
 * The scenario beside the conversation: every value the analysis uses, editable in
 * place, with the Run button. A right-hand panel on desktop that folds away to a thin
 * strip; a bar above the message box opens it (on phones, as a sheet). The assistant
 * and the person edit the one shared draft, so whatever either changes shows here.
 */

import { forwardRef, useEffect, useId, useRef, type ReactNode, type Ref } from "react";
import { FIELD_LABELS, ScenarioSummary, type ScenarioValues } from "@lucerna/ui";
import { ChevronIcon } from "@/components/common/icons";
import { summaryData } from "@/lib/results/viewData";
import {
  isDraftReady,
  missingFields,
  REQUIRED_FIELDS,
  type DraftPatch,
  type ScenarioDraft,
} from "@/lib/scenario/draft";
import { draftKey } from "@/lib/scenario/changes";
import { cn } from "@/lib/utils";

/** Parts of the full details view the panel can open at. */
export type DetailsSection = "income" | "health" | "years";

export interface ScenarioStatus {
  tone: "todo" | "ready" | "done" | "stale";
  text: string;
}

/** Where the scenario stands: what's still needed, or whether it has been run as it is. */
export function scenarioStatus(draft: ScenarioDraft, ranKey: string | null): ScenarioStatus {
  const missing = missingFields(draft);
  if (missing.length === REQUIRED_FIELDS.length) return { tone: "todo", text: "Add your details" };
  if (missing.length > 0) {
    const names = missing.map((m) => {
      const label = FIELD_LABELS[m] ?? m;
      return label.charAt(0).toLowerCase() + label.slice(1);
    });
    return { tone: "todo", text: `Still needed: ${names.join(", ")}` };
  }
  if (!isDraftReady(draft)) return { tone: "todo", text: "Check your income details" };
  if (ranKey == null) return { tone: "ready", text: "Ready to run" };
  return ranKey === draftKey(draft)
    ? { tone: "done", text: "Up to date" }
    : { tone: "stale", text: "Changes not run yet" };
}

const DOT: Record<ScenarioStatus["tone"], string> = {
  todo: "bg-paper-stone",
  ready: "bg-pine-mid",
  done: "bg-sage",
  stale: "bg-caution",
};

export interface ScenarioPanelProps {
  draft: ScenarioDraft;
  status: ScenarioStatus;
  /** Fields the assistant just filled in. */
  highlight?: (keyof ScenarioValues)[];
  /** Edit a value. Omit for a read-only panel (the demo). */
  onEdit?: (patch: DraftPatch) => void;
  /** Open the full details view (income sources, health insurance, year by year). */
  onOpenDetails?: (section?: DetailsSection) => void;
  /** Run the analysis. Omit to hide the footer. */
  onRun?: () => void;
  runDisabled?: boolean;
  /** The eyebrow and heading, when the scenario isn't the visitor's own. */
  eyebrow?: string;
  heading?: ReactNode;
  /** Close control, for the phone sheet. */
  onClose?: () => void;
  /** Fold the desktop panel away to its strip. */
  onHide?: () => void;
  /** A problem with the last run, shown above the Run button. */
  notice?: string | null;
}

/** A panel on the right, with an arrow toward the edge (hide) or away from it (show). */
function PanelToggleIcon({ show = false }: { show?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M15 4v16" />
      <path d={show ? "M10 10l-2 2 2 2" : "M8 10l2 2-2 2"} />
    </svg>
  );
}

/** The panel's content, shared by the desktop panel and the phone sheet. */
export const ScenarioPanelContent = forwardRef<HTMLHeadingElement, ScenarioPanelProps>(
  function ScenarioPanelContent(
    {
      draft,
      status,
      highlight,
      onEdit,
      onOpenDetails,
      onRun,
      runDisabled,
      eyebrow = "Your scenario",
      heading = (
        <>
          Run <em className="text-pine">your numbers.</em>
        </>
      ),
      onClose,
      onHide,
      notice,
    },
    headingRef
  ) {
    const headingId = useId();
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="scenario-panel">
        <div className="flex items-start justify-between gap-3 px-comfortable pb-4 pt-comfortable">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="eyebrow-pine">{eyebrow}</span>
            <h2
              ref={headingRef}
              id={headingId}
              tabIndex={-1}
              className="font-serif text-[24px] font-semibold leading-tight tracking-[-0.01em] text-text-primary outline-none"
            >
              {heading}
            </h2>
            <p className="flex items-center gap-2 text-caption text-text-secondary">
              <span
                aria-hidden="true"
                className={cn("h-2 w-2 shrink-0 rounded-full", DOT[status.tone])}
              />
              {status.text}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 min-h-[44px] rounded-full px-3 text-body-sm font-semibold text-pine hover:bg-paper-deep"
            >
              Done
            </button>
          )}
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide your scenario"
              className="-mr-2 -mt-1 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3 text-body-sm font-semibold text-pine transition-colors duration-200 hover:bg-paper-deep"
            >
              <PanelToggleIcon />
              Hide
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          <ScenarioSummary
            variant="panel"
            data={summaryData(draft)}
            onEdit={onEdit ? (patch) => onEdit(patch as DraftPatch) : undefined}
            onOpenForm={onEdit && onOpenDetails ? () => onOpenDetails() : undefined}
            highlight={highlight}
          />
          {onOpenDetails && <MoreDetails draft={draft} onOpen={onOpenDetails} />}
        </div>

        {onRun && notice && (
          <p
            role="alert"
            className="border-t border-border px-comfortable pt-3 text-caption text-negative"
          >
            {notice}
          </p>
        )}
        {onRun && (
          <div className="flex flex-col gap-2.5 border-t border-border bg-card px-comfortable py-default">
            <button
              type="button"
              className="btn-dark w-full"
              disabled={runDisabled}
              onClick={onRun}
            >
              Run the numbers
            </button>
            <p className="text-center text-caption text-text-tertiary">
              Tap any value to change it. Nothing runs until you say so.
            </p>
          </div>
        )}
      </div>
    );
  }
);

function MoreDetails({
  draft,
  onOpen,
}: {
  draft: ScenarioDraft;
  onOpen: (section: DetailsSection) => void;
}) {
  const sources = draft.income_sources.length;
  const adjusted = draft.timeline.filter((y) => (y.notes && y.notes.length > 0) || y.state).length;
  const rows: { section: DetailsSection; title: string; detail: string }[] = [
    {
      section: "income",
      title: "Income in retirement",
      detail:
        sources > 0
          ? `${sources} ${sources === 1 ? "source" : "sources"} added`
          : "Social Security, pensions and other income",
    },
    {
      section: "health",
      title: "Health insurance",
      detail: draft.include_aca
        ? "Buying on the ACA marketplace"
        : "ACA marketplace premiums and subsidies",
    },
    ...(draft.timeline.length > 0
      ? [
          {
            section: "years" as const,
            title: "Income year by year",
            detail:
              adjusted > 0
                ? `${adjusted} ${adjusted === 1 ? "year" : "years"} adjusted`
                : "Adjust any year for a job change or time off",
          },
        ]
      : []),
  ];
  return (
    <div className="border-t border-border">
      <h3 className="eyebrow px-comfortable pb-1 pt-4">More details</h3>
      <ul className="m-0 list-none p-0">
        {rows.map((row) => (
          <li key={row.section} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => onOpen(row.section)}
              className="flex min-h-[56px] w-full items-center justify-between gap-4 px-comfortable py-2 text-left transition-colors duration-200 hover:bg-paper"
            >
              <span className="flex flex-col">
                <span className="text-body-sm font-semibold text-text-primary">{row.title}</span>
                <span className="text-caption text-text-tertiary">{row.detail}</span>
              </span>
              <ChevronIcon className="shrink-0 text-text-tertiary" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Desktop: a sticky column to the right of the conversation. Closed, it folds to a thin
 * strip whose arrow opens it again. Open and closed animate the width, so the
 * conversation beside it glides to stay centered in the room left.
 */
export const ScenarioPanel = forwardRef<
  HTMLHeadingElement,
  ScenarioPanelProps & {
    open: boolean;
    onShow: () => void;
    /** Animate opening and closing (off for the first render, so a page loads still). */
    animate?: boolean;
    /** The strip's button, to return focus to when the panel is hidden. */
    stripRef?: Ref<HTMLButtonElement>;
    hidden?: boolean;
    className?: string;
  }
>(function ScenarioPanel({ open, onShow, animate, stripRef, hidden, className, ...props }, ref) {
  const contentId = useId();
  const label = props.eyebrow ?? "Your scenario";
  return (
    <aside
      aria-label={label}
      className={cn(
        "sticky top-[68px] hidden h-[calc(100dvh-68px)] shrink-0 self-start overflow-hidden border-l border-border bg-card",
        open ? "w-[360px] xl:w-[400px]" : "w-11",
        animate &&
          "transition-[width,box-shadow] duration-300 ease-out motion-reduce:transition-none",
        hidden ? "lg:hidden" : "lg:block",
        className
      )}
    >
      <div
        id={contentId}
        className={cn(
          "flex h-full w-[360px] flex-col xl:w-[400px]",
          open ? "visible opacity-100" : "invisible opacity-0",
          animate && "transition-[opacity,visibility] duration-300 motion-reduce:transition-none"
        )}
      >
        <ScenarioPanelContent ref={ref} {...props} />
      </div>
      {!open && (
        <button
          ref={stripRef}
          type="button"
          onClick={onShow}
          aria-expanded="false"
          aria-controls={contentId}
          aria-label={`Show ${label.toLowerCase()}`}
          title={`Show ${label.toLowerCase()}`}
          className="group absolute inset-0 flex justify-center bg-card pt-[18px] text-pine transition-colors duration-200 hover:bg-paper"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-paper-deep">
            <PanelToggleIcon show />
          </span>
        </button>
      )}
    </aside>
  );
});

/**
 * A bar above the message box that opens the scenario: the sheet on phones, the panel on
 * desktop while it's folded away. It says where the scenario stands and how many values
 * the assistant just filled in.
 */
export function ScenarioBar({
  status,
  label = "Your scenario",
  newCount = 0,
  onOpen,
  className,
}: {
  status: ScenarioStatus;
  label?: string;
  /** Details the assistant just filled in, not yet changed or seen. */
  newCount?: number;
  onOpen: () => void;
  className?: string;
}) {
  const text = newCount > 0 ? `${status.text} · ${newCount} new` : status.text;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Review ${label.toLowerCase()}. ${text}`}
      className={cn(
        "mb-2.5 flex w-full items-center gap-3 rounded-[16px] border border-border-emphasis bg-card py-1.5 pl-4 pr-1.5 text-left shadow-elevated",
        className
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="text-[14.5px] font-semibold text-text-primary">{label}</span>
        <span className="flex items-center gap-1.5 truncate text-caption text-text-tertiary">
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[status.tone])}
          />
          {text}
        </span>
      </span>
      <span className="inline-flex min-h-[40px] items-center rounded-full bg-pine-deep px-4 text-[14px] font-semibold text-[#f5f2ea]">
        Review
      </span>
    </button>
  );
}

/**
 * Phones: the panel as a sheet over the conversation. Focus moves into it and back,
 * Tab stays inside, and Escape or the scrim closes it.
 */
export function ScenarioSheet({
  open,
  onClose,
  ...props
}: ScenarioPanelProps & { open: boolean; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
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
      onClose();
      return;
    }
    if (e.key !== "Tab" || !sheetRef.current) return;
    const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]"
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
      className="fixed inset-0 z-50 flex flex-col justify-end bg-pine-deep/35 pt-14 lg:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.eyebrow ?? "Your scenario"}
        onKeyDown={onKeyDown}
        className="animate-sheet-up flex max-h-full min-h-0 flex-col overflow-hidden rounded-t-[22px] bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-paper-stone"
        />
        <ScenarioPanelContent ref={headingRef} {...props} onClose={onClose} />
      </div>
    </div>
  );
}
