"use client";

import { createContext, useContext } from "react";
import type { StoredResult } from "@/lib/agent/types";
import type { DraftPatch, ScenarioDraft } from "@/lib/scenario/draft";

export interface ConversationContextValue {
  results: Record<string, StoredResult>;
  draft: ScenarioDraft;
  streaming: boolean;
  /** Send a message as the user. */
  send: (text: string) => void;
  /** Edit the shared scenario (summary card edits). */
  editDraft: (patch: DraftPatch) => void;
  /** Open the full results view for a result. */
  openResults: (resultId: string) => void;
  /** Make a what-if result the user's scenario. */
  applyWhatIf?: (resultId: string) => void;
  /** Switch to the form (for edits the summary card can't make inline). */
  openForm?: () => void;
  /** Recompute a result that was dropped from session storage. */
  ensureResult: (resultId: string) => void;
}

export const ConversationContext = createContext<ConversationContextValue | null>(null);

export function useConversationContext(): ConversationContextValue {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error("useConversationContext must be used within ConversationContext");
  return ctx;
}
