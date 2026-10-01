import type { OptimizationResult, ScenarioInput } from "@/lib/types";
import type { ScenarioDraft } from "@/lib/scenario/draft";

/** Something the assistant asked the UI to display. Numbers inside come from the engine. */
export type AgentPart =
  | { kind: "scenario_summary"; draft: ScenarioDraft; draft_hash: string }
  | { kind: "result_headline"; result_id: string }
  | { kind: "bracket_fill"; result_id: string }
  | { kind: "balance_comparison"; result_id: string }
  | { kind: "scenario_compare"; result_id: string; base_result_id: string; label: string }
  | { kind: "suggestions"; suggestions: string[] };

export type AgentErrorCode =
  | "unavailable"
  | "conversation_limit"
  | "daily_limit"
  | "refusal"
  | "too_long"
  | "network";

/** Server-sent events from POST /api/agent (see backend/app/agent/loop.py). */
export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; name: string; status: string }
  | { type: "draft"; draft: ScenarioDraft; missing: string[] }
  | {
      type: "result";
      result_id: string;
      label: string;
      result: OptimizationResult;
      draft?: ScenarioDraft;
    }
  | { type: "part"; part: AgentPart }
  | { type: "error"; code: AgentErrorCode; message: string }
  | { type: "done"; messages: unknown[] };

export type UiPart =
  | { kind: "text"; text: string }
  | AgentPart
  | { kind: "notice"; code: AgentErrorCode; message: string };

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  parts: UiPart[];
}

export interface StoredResult {
  label: string;
  input: ScenarioInput;
  /** Null after a reload when the full result didn't fit in session storage. */
  result: OptimizationResult | null;
  /** Scenario that produced a what-if result, so it can be applied. */
  draft?: ScenarioDraft;
}

export interface DemoConversation {
  persona: { name: string; age: number; occupation: string; situation: string };
  exchanges: { user: string; events: AgentEvent[] }[];
  messages: unknown[];
  draft: ScenarioDraft;
  source: "agent" | "scripted";
  cache_key: string;
}

/** Errors that send the user to the form with their scenario intact. */
export const FALLBACK_CODES: ReadonlySet<AgentErrorCode> = new Set([
  "unavailable",
  "conversation_limit",
  "daily_limit",
  "too_long",
  "network",
]);
