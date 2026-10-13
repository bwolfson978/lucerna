"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { useAccount } from "@/lib/auth/account";
import { SavedScenarioError, savedScenarios } from "@/lib/api/savedScenarios";
import { hasDraftValues, type ScenarioDraft } from "@/lib/scenario/draft";

// Signing in with Google leaves the page and comes back, so "save once signed in" is
// remembered for this tab.
const PENDING_KEY = "lucerna:save-after-sign-in";

function setPending(): void {
  try {
    sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    // Storage unavailable: the visitor taps Save again after signing in.
  }
}

function takePending(): boolean {
  try {
    const pending = sessionStorage.getItem(PENDING_KEY) === "1";
    sessionStorage.removeItem(PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}

export type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; name: string; scenarioId: string }
  | { state: "error"; message: string };

/** The scenario a "saved" status refers to. */
type Internal = SaveStatus & { draft?: ScenarioDraft };

/**
 * Save the current scenario to the visitor's account. Signed out, `save` opens sign-in
 * first and saves when they're back.
 */
export function useSaveScenario(draft: ScenarioDraft, surface: string) {
  const account = useAccount();
  const [internal, setStatus] = useState<Internal>({ state: "idle" });
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Changing the scenario after saving makes it a new, unsaved one.
  const status: SaveStatus =
    internal.state === "saved" && internal.draft !== draft ? { state: "idle" } : internal;

  const saveNow = useCallback(async () => {
    const current = draftRef.current;
    setStatus({ state: "saving" });
    try {
      const saved = await savedScenarios.save(current);
      setStatus({
        state: "saved",
        name: saved.name,
        scenarioId: saved.scenario_id,
        draft: current,
      });
      posthog.capture("scenario_saved", { surface });
    } catch (err) {
      const message =
        err instanceof SavedScenarioError ? err.message : "Something went wrong. Try again.";
      setStatus({ state: "error", message });
    }
  }, [surface]);

  const save = useCallback(() => {
    if (!account.enabled) return;
    if (!account.signedIn) {
      setPending();
      posthog.capture("sign_in_to_save", { surface });
      account.openSignIn();
      return;
    }
    void saveNow();
  }, [account, saveNow, surface]);

  // Back from signing in: finish the save they asked for, once the scenario is restored.
  const draftReady = hasDraftValues(draft);
  useEffect(() => {
    if (account.loaded && account.signedIn && draftReady && takePending()) {
      // Resumes an action the visitor started before the sign-in redirect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void saveNow();
    }
  }, [account.loaded, account.signedIn, draftReady, saveNow]);

  return { status, save, available: account.enabled };
}
