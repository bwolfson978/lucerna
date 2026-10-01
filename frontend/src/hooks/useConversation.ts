"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import posthog from "posthog-js";
import type { OptimizationResult } from "@/lib/types";
import { streamAgent } from "@/lib/agent/client";
import {
  INITIAL_CONVERSATION,
  clearConversation,
  conversationReducer,
  loadConversation,
  saveConversation,
  type ConversationState,
} from "@/lib/agent/conversation";
import {
  FALLBACK_CODES,
  type AgentErrorCode,
  type AgentEvent,
  type DemoConversation,
} from "@/lib/agent/types";
import type { ScenarioDraft } from "@/lib/scenario/draft";

interface UseConversationOptions {
  /** sessionStorage key. Omit to keep the conversation in memory only. */
  storageKey?: string;
  /** Current scenario draft, sent with every message. */
  getDraft: () => ScenarioDraft;
  /** The assistant recorded new scenario values. */
  onDraft: (draft: ScenarioDraft) => void;
  /** The assistant can't continue (limit, outage); the page should offer the form. */
  onFallback?: (code: AgentErrorCode) => void;
  /** Analytics label for events, e.g. "calculator" or "demo". */
  surface: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let idCounter = 0;
const nextId = () => `m${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function useConversation({
  storageKey,
  getDraft,
  onDraft,
  onFallback,
  surface,
}: UseConversationOptions) {
  const [state, dispatch] = useReducer(conversationReducer, INITIAL_CONVERSATION);
  const stateRef = useRef<ConversationState>(state);
  const abortRef = useRef<AbortController | null>(null);
  const replayToken = useRef(0);
  const restored = useRef(false);
  const callbacks = useRef({ getDraft, onDraft, onFallback });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    callbacks.current = { getDraft, onDraft, onFallback };
  }, [getDraft, onDraft, onFallback]);

  // Restore this tab's conversation after mount (sessionStorage is client-only).
  useEffect(() => {
    if (!storageKey) {
      restored.current = true;
      return;
    }
    const saved = loadConversation(storageKey);
    if (saved) dispatch({ type: "load", state: saved });
    restored.current = true;
  }, [storageKey]);

  // Save whenever a turn finishes.
  useEffect(() => {
    if (!storageKey || !restored.current || state.streaming) return;
    if (state.messages.length === 0) return;
    saveConversation(storageKey, state);
  }, [state, storageKey]);

  // Stop streaming and replays when the component goes away.
  useEffect(() => {
    const token = replayToken;
    return () => {
      abortRef.current?.abort();
      token.current += 1;
    };
  }, []);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      dispatch({ type: "event", event });
      if (event.type === "draft") callbacks.current.onDraft(event.draft);
      if (event.type === "part") {
        if (event.part.kind === "result_headline")
          posthog.capture("agent_result_shown", { surface });
        if (event.part.kind === "scenario_compare") posthog.capture("what_if_run", { surface });
        if (event.part.kind === "scenario_summary")
          posthog.capture("scenario_summary_shown", { surface });
      }
      if (event.type === "error") {
        posthog.capture("agent_error", { surface, code: event.code });
        if (FALLBACK_CODES.has(event.code)) callbacks.current.onFallback?.(event.code);
      }
    },
    [surface]
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || stateRef.current.streaming) return;
      replayToken.current += 1; // a live message ends any replay in progress
      const controller = new AbortController();
      abortRef.current = controller;
      dispatch({ type: "user", id: nextId(), text: message });
      posthog.capture("agent_message_sent", {
        surface,
        message_index: stateRef.current.messages.filter((m) => m.role === "user").length + 1,
      });
      await streamAgent(
        {
          message,
          messages: stateRef.current.apiMessages,
          draft: callbacks.current.getDraft(),
        },
        handleEvent,
        controller.signal
      );
    },
    [handleEvent, surface]
  );

  /** Play a recorded conversation as if it were happening now. */
  const replay = useCallback(
    async (demo: DemoConversation, { animate }: { animate: boolean }) => {
      const token = ++replayToken.current;
      const live = () => replayToken.current === token;
      dispatch({ type: "reset" });
      for (const [index, exchange] of demo.exchanges.entries()) {
        if (!live()) return;
        if (animate && index > 0) await sleep(700);
        dispatch({ type: "user", id: nextId(), text: exchange.user });
        if (animate) await sleep(450);
        for (const event of exchange.events) {
          if (!live()) return;
          if (event.type === "text_delta" && animate) {
            for (const chunk of event.text.match(/\S+\s*/g) ?? [event.text]) {
              if (!live()) return;
              handleEvent({ type: "text_delta", text: chunk });
              await sleep(16);
            }
          } else {
            if (animate && event.type === "part") await sleep(250);
            handleEvent(event);
          }
        }
        const last = index === demo.exchanges.length - 1;
        dispatch({
          type: "event",
          event: { type: "done", messages: last ? demo.messages : [] },
        });
      }
    },
    [handleEvent]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    replayToken.current += 1;
    dispatch({ type: "reset" });
    if (storageKey) clearConversation(storageKey);
  }, [storageKey]);

  const loadResult = useCallback(
    (id: string, result: NonNullable<ConversationState["results"][string]["result"]>) =>
      dispatch({ type: "result_loaded", id, result }),
    []
  );

  /** Add a result that didn't come from the assistant (a full results link). */
  const addResult = useCallback(
    (entry: { result_id: string; label: string; result: OptimizationResult }) =>
      dispatch({ type: "event", event: { type: "result", ...entry } }),
    []
  );

  return { state, send, replay, reset, loadResult, addResult };
}

export type ConversationApi = ReturnType<typeof useConversation>;
