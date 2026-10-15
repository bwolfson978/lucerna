"use client";

import { useId, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/utils/constants";

/** What the person types to unlock the delete button. */
export const DELETE_PHRASE = "delete my account";

interface DeleteAccountCardProps {
  /** How many scenarios the account holds; null while unknown. */
  scenarioCount: number | null;
  /** Deletes the account and everything saved in it; rejects if anything fails. */
  onDelete: () => Promise<void>;
  /** Downloads a copy of the saved scenarios; the link is hidden without it. */
  onDownload?: () => void;
  /** Opens the confirm dialog on first render (Storybook, screenshots). */
  defaultOpen?: boolean;
}

/** "Your 8 saved scenarios" style phrases, so the copy says exactly what goes. */
function scenariosPhrase(count: number | null, capital = false) {
  const text =
    count === null
      ? "every saved scenario"
      : count === 1
        ? "your 1 saved scenario"
        : `all ${count} saved scenarios`;
  return capital ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** The danger zone on Account settings: what deleting removes, and a typed confirmation. */
export function DeleteAccountCard({
  scenarioCount,
  onDelete,
  onDownload,
  defaultOpen = false,
}: DeleteAccountCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      id="delete"
      aria-labelledby="delete-account-heading"
      className="scroll-mt-24 overflow-hidden rounded-md border border-negative/30 bg-card sm:rounded-lg"
    >
      <div className="flex flex-col gap-1 p-comfortable sm:p-6">
        <h2 id="delete-account-heading" className="text-[18px] font-semibold leading-[1.3]">
          Delete account
        </h2>
        <p className="max-w-[620px] text-body-sm text-text-secondary">
          {scenarioCount === 0
            ? "Permanently deletes your account. You have no saved scenarios right now. This can't be undone."
            : `Permanently deletes your account and ${scenariosPhrase(scenarioCount)}, including ones saved from Claude or ChatGPT. This can't be undone.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-negative/20 bg-negative/[0.04] px-comfortable py-3.5 sm:px-6">
        <span className="text-caption font-normal text-text-tertiary">
          {onDownload && scenarioCount !== 0
            ? "Want to keep your work? Download your scenarios first."
            : "You'll be signed out everywhere."}
        </span>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>
      {open && (
        <DeleteAccountDialog
          scenarioCount={scenarioCount}
          onDelete={onDelete}
          onDownload={onDownload}
          onCancel={() => setOpen(false)}
        />
      )}
    </section>
  );
}

interface DeleteAccountDialogProps {
  scenarioCount: number | null;
  onDelete: () => Promise<void>;
  onDownload?: () => void;
  onCancel: () => void;
}

function DeleteAccountDialog({
  scenarioCount,
  onDelete,
  onDownload,
  onCancel,
}: DeleteAccountDialogProps) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "deleting" | "failed">("idle");
  const id = useId();
  const deleting = phase === "deleting";
  const typed = text.trim().toLowerCase() === DELETE_PHRASE;

  const confirm = async () => {
    if (!typed || deleting) return;
    setPhase("deleting");
    try {
      await onDelete();
    } catch {
      setPhase("failed");
    }
  };

  return (
    <ConfirmDialog
      open
      icon="warning"
      title="Delete your account?"
      description="This is permanent. Here's what goes:"
      confirmLabel={
        deleting ? "Deleting account" : phase === "failed" ? "Try again" : "Delete account"
      }
      confirmDisabled={!typed}
      busy={deleting}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      <ul className="flex flex-col gap-2">
        <Gone>Your account and sign-in</Gone>
        {scenarioCount !== 0 && (
          <Gone>
            {scenariosPhrase(scenarioCount, true)}, including ones saved from Claude or ChatGPT
          </Gone>
        )}
      </ul>
      {onDownload && scenarioCount !== 0 && (
        <div className="flex gap-2.5 rounded-[10px] bg-paper-warm px-3.5 py-3 text-body-sm text-text-secondary">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            strokeWidth="1.8"
            className="mt-[3px] shrink-0"
            {...ICON}
          >
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          <span>
            Want a copy first?{" "}
            <button
              type="button"
              onClick={onDownload}
              className="font-semibold text-pine underline underline-offset-2"
            >
              Download your scenarios
            </button>
          </span>
        </div>
      )}
      <div className="mt-1 flex flex-col gap-2">
        <label htmlFor={`${id}-confirm`} className="text-caption text-text-secondary">
          To confirm, type{" "}
          <span className="rounded-[6px] bg-paper-warm px-1.5 py-px font-mono text-[13px] font-normal text-text-primary">
            {DELETE_PHRASE}
          </span>
        </label>
        <input
          id={`${id}-confirm`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void confirm();
          }}
          disabled={deleting}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-body text-text-primary outline-none transition-[border-color,box-shadow] duration-200 focus:border-pine focus:ring-2 focus:ring-pine-mid/15 disabled:opacity-60 sm:text-body-sm"
        />
      </div>
      {phase === "failed" && (
        <div
          role="alert"
          className="flex gap-2.5 rounded-[10px] border border-negative/25 bg-negative/[0.06] px-3.5 py-3 text-body-sm text-negative"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            strokeWidth="1.8"
            className="mt-[3px] shrink-0"
            {...ICON}
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5" />
            <path d="M12 16h.01" />
          </svg>
          <span>
            We couldn&apos;t finish deleting your account. Try again, or email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="break-all underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>{" "}
            and we&apos;ll finish it for you.
          </span>
        </div>
      )}
    </ConfirmDialog>
  );
}

function Gone({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-body-sm text-text-secondary">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        strokeWidth="2.2"
        className="mt-[3px] shrink-0 text-negative"
        {...ICON}
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
      <span>{children}</span>
    </li>
  );
}
