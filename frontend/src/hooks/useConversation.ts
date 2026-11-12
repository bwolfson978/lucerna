"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import posthog from "posthog-js";
import type { OptimizationResult } from "@/lib/types";
import { streamAgent } from "@/lib/agent/client";
import {
  INITIAL_CONVERSATION,
  clearConversation,
  conversationReducer,
  editPoint,
  loadConversation,
  saveConversation,
  wordChunks,
  type ConversationState,
} from "@/lib/agent/conversation";
import {
  FALLBACK_CODES,
  type AgentErrorCode,
  type AgentEvent,
  type DemoConversation,
  type ReplyRating,
} from "@/lib/agent/types";
import { replyRatings } from "@/lib/agent/replyRating";
import type { ScenarioDraft } from "@/lib/scenario/draft";

interface UseConversationOptions {
  /** sessionStorage key. Omit to keep the conversation in memory only. */
  storageKey?: string;
  /** Current scenario draft, sent with every message. */
  getDraft: () => ScenarioDraft;
  /** The assistant recorded new scenario values. */
  onDraft: (draft: ScenarioDraft) => void;
  /**
   * An edited message puts the scenario back to how it was when that message was
   * first sent, before the conversation reruns from there.
   */
  onRewind?: (draft: ScenarioDraft) => void;
  /** The assistant can't continue (limit, outage); the scenario still runs without it. */
  onFallback?: (code: AgentErrorCode) => void;
  /** The assistant ran the engine (a live turn or a replay). */
  onResult?: (event: Extract<AgentEvent, { type: "result" }>) => void;
  /** Analytics label for events, e.g. "calculator" or "demo". */
  surface: string;
}

/** A point in a replayed conversation where playback can wait. */
export interface ReplayStop {
  /** Which exchange (question and reply), from 0. */
  exchange: number;
  /** before: the question is about to be asked. asked: it is on screen. card: a result
   * card just appeared. answered: the reply is complete. */
  at: "before" | "asked" | "card" | "answered";
  /** This is the last exchange. */
  last: boolean;
}

export interface ReplayOptions {
  animate: boolean;
  pause?: (stop: ReplayStop) => Promise<void>;
}

/** Replay timing in milliseconds: slow enough to follow each step as it happens. */
export const REPLAY_PACE = {
  betweenTurns: 700,
  afterQuestion: 450,
  tool: 900,
  part: 250,
  word: 40,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let idCounter = 0;
const nextId = () => `m${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function useConversation({
  storageKey,
  getDraft,
  onDraft,
  onFallback,
  onResult,
  onRewind,
  surface,
}: UseConversationOptions) {
  const [state, dispatch] = useReducer(conversationReducer, INITIAL_CONVERSATION);
  const stateRef = useRef<ConversationState>(state);
  const abortRef = useRef<AbortController | null>(null);
  const replayToken = useRef(0);
  const restored = useRef(false);
  const callbacks = useRef({ getDraft, onDraft, onFallback, onResult, onRewind });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    callbacks.current = { getDraft, onDraft, onFallback, onResult, onRewind };
  }, [getDraft, onDraft, onFallback, onResult, onRewind]);

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
      if (event.type === "result") callbacks.current.onResult?.(event);
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
      const draft = callbacks.current.getDraft();
      dispatch({ type: "user", id: nextId(), text: message, draft });
      posthog.capture("agent_message_sent", {
        surface,
        message_index: stateRef.current.messages.filter((m) => m.role === "user").length + 1,
      });
      await streamAgent(
        { message, messages: stateRef.current.apiMessages, draft },
        handleEvent,
        controller.signal
      );
    },
    [handleEvent, surface]
  );

  /**
   * Replace one of the person's messages with new text and rerun the conversation
   * from there: the message and everything after it are dropped, the scenario goes
   * back to how it was when the message was sent, and the assistant answers again.
   */
  const edit = useCallback(
    async (messageId: string, text: string) => {
      const message = text.trim();
      const current = stateRef.current;
      const point = editPoint(current, messageId);
      if (!message || !point || current.streaming) return;
      replayToken.current += 1;
      const controller = new AbortController();
      abortRef.current = controller;
      if (point.draft) callbacks.current.onRewind?.(point.draft);
      const draft = callbacks.current.getDraft();
      dispatch({ type: "edit", messageId, id: nextId(), text: message, draft });
      const index = current.messages.findIndex((m) => m.id === messageId);
      posthog.capture("agent_message_edited", {
        surface,
        message_index: current.messages.slice(0, index + 1).filter((m) => m.role === "user").length,
      });
      await streamAgent(
        { message, messages: point.apiMessages, draft },
        handleEvent,
        controller.signal
      );
    },
    [handleEvent, surface]
  );

  /**
   * Play a recorded conversation as if it were happening now. With `pause`, playback
   * waits at each stop until the promise settles (the /demo tour explains the step).
   */
  const replay = useCallback(
    async (demo: DemoConversation, { animate, pause }: ReplayOptions) => {
      const token = ++replayToken.current;
      const live = () => replayToken.current === token;
      const stop = async (exchange: number, at: ReplayStop["at"]) => {
        if (animate && pause && live())
          await pause({ exchange, at, last: exchange === demo.exchanges.length - 1 });
      };
      dispatch({ type: "reset" });
      for (const [index, exchange] of demo.exchanges.entries()) {
        if (!live()) return;
        if (animate && index > 0) await sleep(REPLAY_PACE.betweenTurns);
        await stop(index, "before");
        if (!live()) return;
        dispatch({ type: "user", id: nextId(), text: exchange.user, replay: true });
        if (animate) await sleep(REPLAY_PACE.afterQuestion);
        await stop(index, "asked");
        for (const event of exchange.events) {
          if (!live()) return;
          if (event.type === "text_delta" && animate) {
            for (const chunk of wordChunks(event.text)) {
              if (!live()) return;
              handleEvent({ type: "text_delta", text: chunk });
              await sleep(REPLAY_PACE.word);
            }
          } else {
            handleEvent(event);
            // Long enough to read "Running the optimizer" before the card replaces it.
            if (animate && event.type === "tool_start") await sleep(REPLAY_PACE.tool);
            if (animate && event.type === "part") await sleep(REPLAY_PACE.part);
            if (event.type === "part" && event.part.kind === "mcp_app") await stop(index, "card");
          }
        }
        if (!live()) return;
        const last = index === demo.exchanges.length - 1;
        dispatch({
          type: "event",
          event: { type: "done", messages: last ? demo.messages : [] },
        });
        await stop(index, "answered");
      }
    },
    [handleEvent]
  );

  /** Rate a reply, change its rating, or clear it (null). */
  const rate = useCallback((messageId: string, rating: ReplyRating | null) => {
    const traceId = stateRef.current.messages.find((m) => m.id === messageId)?.traceId;
    if (!traceId) return;
    dispatch({ type: "rate", messageId, rating });
    replyRatings.pick(traceId, rating);
  }, []);

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

  return { state, send, edit, rate, replay, reset, loadResult, addResult };
}

export type ConversationApi = ReturnType<typeof useConversation>;
