"use client";

import { useState } from "react";
import { SUPPORT_EMAIL } from "@/lib/utils/constants";

interface DeleteAccountCardProps {
  /** Deletes the account and everything saved in it; rejects if anything fails. */
  onDelete: () => Promise<void>;
}

/** "Delete account" at the bottom of My scenarios, with a confirm step. */
export function DeleteAccountCard({ onDelete }: DeleteAccountCardProps) {
  const [step, setStep] = useState<"idle" | "confirming" | "deleting" | "failed">("idle");

  const remove = async () => {
    setStep("deleting");
    try {
      await onDelete();
    } catch {
      setStep("failed");
    }
  };

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="flex flex-col gap-3 border-t border-border pt-section"
    >
      <h2 id="delete-account-heading" className="text-h3 text-text-primary">
        Delete account
      </h2>
      <p className="max-w-[560px] text-body-sm leading-relaxed text-text-secondary">
        Permanently deletes your account and every scenario saved in it, including ones saved from
        Claude or ChatGPT. This can&apos;t be undone.
      </p>

      {step === "idle" && (
        <button
          type="button"
          onClick={() => setStep("confirming")}
          className="self-start text-body-sm font-medium text-negative transition-colors duration-200 hover:underline"
        >
          Delete my account
        </button>
      )}

      {(step === "confirming" || step === "deleting") && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-body-sm text-text-primary">Delete everything for good?</span>
          <button
            type="button"
            onClick={remove}
            disabled={step === "deleting"}
            className="rounded-md bg-negative px-4 py-2 text-body-sm font-medium text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
          >
            {step === "deleting" ? "Deleting…" : "Yes, delete my account"}
          </button>
          <button
            type="button"
            onClick={() => setStep("idle")}
            disabled={step === "deleting"}
            className="text-body-sm text-text-tertiary transition-colors duration-200 hover:text-text-secondary"
          >
            Cancel
          </button>
        </div>
      )}

      {step === "failed" && (
        <p role="alert" className="text-body-sm text-negative">
          We couldn&apos;t delete your account. Try again, or email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>{" "}
          and we&apos;ll do it for you.
        </p>
      )}
      {step === "failed" && (
        <button
          type="button"
          onClick={remove}
          className="self-start text-body-sm font-medium text-negative transition-colors duration-200 hover:underline"
        >
          Try again
        </button>
      )}
    </section>
  );
}
