"use client";

import { useState } from "react";
import { ConfirmDialog, DialogList } from "@/components/common/ConfirmDialog";
import { SUPPORT_EMAIL } from "@/lib/utils/constants";

interface DeleteAccountCardProps {
  /** Deletes the account and everything saved in it; rejects if anything fails. */
  onDelete: () => Promise<void>;
  /** How many saved scenarios go with the account. */
  scenarioCount: number;
}

const CONFIRM_PHRASE = "delete my account";

function scenariosLabel(n: number) {
  return n === 1 ? "1 saved scenario" : `${n} saved scenarios`;
}

/** The "Danger zone" at the bottom of My scenarios: delete account, typed to confirm. */
export function DeleteAccountCard({ onDelete, scenarioCount }: DeleteAccountCardProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState<"idle" | "deleting" | "failed">("idle");

  const close = () => {
    setOpen(false);
    setTyped("");
    setStep("idle");
  };

  const remove = async () => {
    setStep("deleting");
    try {
      await onDelete();
    } catch {
      setStep("failed");
    }
  };

  return (
    <section aria-labelledby="danger-zone-heading" className="mt-section flex flex-col gap-3">
      <h2
        id="danger-zone-heading"
        className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-text-tertiary"
      >
        Danger zone
      </h2>
      <div className="overflow-hidden rounded-md border border-negative/30 bg-white">
        <div className="flex flex-col gap-1.5 p-6">
          <h3 className="text-[16px] font-semibold text-text-primary">Delete account</h3>
          <p className="max-w-[640px] text-body-sm text-text-secondary">
            Permanently deletes your account and every scenario saved in it, including ones saved
            from Claude or ChatGPT. This can&apos;t be undone.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-negative/20 bg-negative/[0.04] px-6 py-3.5">
          <span className="font-data text-[13px] text-text-tertiary">
            {scenariosLabel(scenarioCount)} will be deleted with it.
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[44px] rounded-full bg-negative px-5 text-body-sm font-semibold text-white transition-colors duration-200 hover:bg-negative/90"
          >
            Delete account
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={open}
        icon="warning"
        title="Delete your account?"
        description="This permanently deletes the following. There's no undo."
        confirmLabel={step === "deleting" ? "Deleting…" : "Delete account"}
        confirmDisabled={typed.trim().toLowerCase() !== CONFIRM_PHRASE}
        busy={step === "deleting"}
        onConfirm={remove}
        onCancel={close}
      >
        <DialogList>
          <li>Your account and sign-in</li>
          <li>
            <span className="font-data">{scenariosLabel(scenarioCount)}</span>
          </li>
          <li>Scenarios you saved from Claude or ChatGPT</li>
        </DialogList>
        <div className="mt-1 flex flex-col gap-2">
          <label
            htmlFor="delete-account-confirm"
            className="text-[13px] font-medium text-text-secondary"
          >
            To confirm, type{" "}
            <span className="rounded-[6px] bg-paper-warm px-1.5 py-px font-mono text-[13px] text-text-primary">
              {CONFIRM_PHRASE}
            </span>
          </label>
          <input
            id="delete-account-confirm"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-body-sm text-text-primary outline-none focus:border-pine focus:ring-2 focus:ring-pine-mid/15"
          />
        </div>
        {step === "failed" && (
          <p role="alert" className="text-body-sm text-negative">
            We couldn&apos;t delete your account. Try again, or email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>{" "}
            and we&apos;ll do it for you.
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
