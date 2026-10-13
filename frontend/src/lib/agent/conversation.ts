/**
 * Conversation state: what the thread shows, the API history the backend needs,
 * and the engine results the cards render.
 *
 * The API history is opaque to the browser. It is stored exactly as the backend
 * returned it (thinking blocks and all) and sent back with the next message.
 */

import type { AgentEvent, StoredResult, UiMessage, UiPart } from "./types";

export interface ConversationState {
  messages: UiMessage[];
  apiMessages: unknown[];
  results: Record<string, StoredResult>;
  streaming: boolean;
  /** What the assistant is doing right now, e.g. "Running the optimizer". */
  status: string | null;
  /** Next text delta starts a new paragraph block (a tool or card came in between). */
  breakText: boolean;
}

export const INITIAL_CONVERSATION: ConversationState = {
  messages: [],
  apiMessages: [],
  results: {},
  streaming: false,
  status: null,
  breakText: false,
};

export type ConversationAction =
  | { type: "user"; id: string; text: string }
  | { type: "event"; event: AgentEvent }
  | { type: "result_loaded"; id: string; result: StoredResult["result"] }
  | { type: "load"; state: ConversationState }
  | { type: "reset" };

function updateLastAssistant(
  messages: UiMessage[],
  update: (parts: UiPart[]) => UiPart[]
): UiMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return messages;
  return [...messages.slice(0, -1), { ...last, parts: update(last.parts) }];
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction
): ConversationState {
  switch (action.type) {
    case "user":
      return {
        ...state,
        streaming: true,
        status: null,
        breakText: false,
        messages: [
          ...state.messages,
          { id: `${action.id}-u`, role: "user", parts: [{ kind: "text", text: action.text }] },
          { id: `${action.id}-a`, role: "assistant", parts: [] },
        ],
      };
    case "event":
      return applyEvent(state, action.event);
    case "result_loaded": {
      const existing = state.results[action.id];
      if (!existing) return state;
      return {
        ...state,
        results: { ...state.results, [action.id]: { ...existing, result: action.result } },
      };
    }
    case "load":
      return { ...action.state, streaming: false, status: null, breakText: false };
    case "reset":
      return INITIAL_CONVERSATION;
  }
}

function applyEvent(state: ConversationState, event: AgentEvent): ConversationState {
  switch (event.type) {
    case "text_delta":
      return {
        ...state,
        status: null,
        breakText: false,
        messages: updateLastAssistant(state.messages, (parts) => {
          const last = parts[parts.length - 1];
          if (last?.kind === "text" && !state.breakText) {
            return [...parts.slice(0, -1), { kind: "text", text: last.text + event.text }];
          }
          return [...parts, { kind: "text", text: event.text }];
        }),
      };
    case "tool_start":
      return { ...state, status: event.status, breakText: true };
    case "draft":
      return state;
    case "result":
      return {
        ...state,
        results: {
          ...state.results,
          [event.result_id]: {
            label: event.label,
            input: event.result.input,
            result: event.result,
            ...(event.draft ? { draft: event.draft } : {}),
          },
        },
      };
    case "part":
      return {
        ...state,
        breakText: true,
        messages: updateLastAssistant(state.messages, (parts) => [...parts, event.part]),
      };
    case "saved":
      return {
        ...state,
        breakText: true,
        messages: updateLastAssistant(state.messages, (parts) => [
          ...parts,
          { kind: "saved", scenario_id: event.scenario.scenario_id, name: event.scenario.name },
        ]),
      };
    case "error":
      return {
        ...state,
        breakText: true,
        messages: updateLastAssistant(state.messages, (parts) => [
          ...parts,
          { kind: "notice", code: event.code, message: event.message },
        ]),
      };
    case "done":
      return {
        ...state,
        streaming: false,
        status: null,
        apiMessages: [...state.apiMessages, ...event.messages],
      };
  }
}

/** Number of messages the user has sent in this conversation. */
export function userMessageCount(state: ConversationState): number {
  return state.messages.filter((m) => m.role === "user").length;
}

/** The latest scenario result in the conversation, if any. */
export function latestResultId(state: ConversationState): string | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const parts = state.messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const part = parts[j];
      if (part.kind === "result_headline" || part.kind === "scenario_compare")
        return part.result_id;
      if (part.kind === "mcp_app") {
        const id = part.tool_result.structuredContent?.result_id;
        if (typeof id === "string") return id;
      }
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Session persistence
// --------------------------------------------------------------------------

export function loadConversation(key: string): ConversationState | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConversationState>;
    if (!Array.isArray(parsed.messages) || !Array.isArray(parsed.apiMessages)) return null;
    return { ...INITIAL_CONVERSATION, ...parsed, streaming: false, status: null };
  } catch {
    return null;
  }
}

/**
 * Save the conversation for this tab. Full results can be large; when they don't
 * fit, they are dropped and recomputed from their inputs on demand.
 */
export function saveConversation(key: string, state: ConversationState): void {
  const { messages, apiMessages, results } = state;
  try {
    sessionStorage.setItem(key, JSON.stringify({ messages, apiMessages, results }));
    return;
  } catch {
    // Quota exceeded: retry without result payloads.
  }
  try {
    const slim = Object.fromEntries(
      Object.entries(results).map(([id, r]) => [id, { ...r, result: null }])
    );
    sessionStorage.setItem(key, JSON.stringify({ messages, apiMessages, results: slim }));
  } catch {
    // Storage unavailable (private mode). The conversation lives for this page view.
  }
}

export function clearConversation(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}
