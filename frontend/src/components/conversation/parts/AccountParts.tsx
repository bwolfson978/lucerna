"use client";

import Link from "next/link";
import { useAccount } from "@/lib/auth/account";
import { useConversationContext } from "../ConversationContext";

/** The assistant tried to save while the visitor was signed out. */
export function SignInToSaveCard() {
  const account = useAccount();
  const { saveScenario } = useConversationContext();
  if (!account.enabled || !saveScenario) {
    return (
      <div className="rounded-[14px] border border-border bg-paper-warm px-4 py-3 text-body-sm text-text-secondary">
        Saving scenarios isn&apos;t available right now.
      </div>
    );
  }
  if (account.signedIn) return null; // signed in since; the save went through
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body-sm text-text-secondary">
        Sign in to keep this scenario and come back to it any time.
      </p>
      <button
        type="button"
        onClick={saveScenario}
        className="btn-dark min-h-[44px] shrink-0 px-6 py-2.5 text-[14.5px]"
      >
        Sign in and save
      </button>
    </div>
  );
}

/** The assistant saved the scenario. */
export function SavedNotice({ name }: { name: string }) {
  return (
    <p role="status" className="text-body-sm text-text-secondary">
      Saved as <span className="font-medium text-text-primary">{name}</span>.{" "}
      <Link
        href="/scenarios"
        className="text-pine underline decoration-border underline-offset-4 hover:decoration-pine"
      >
        My scenarios
      </Link>
    </p>
  );
}
