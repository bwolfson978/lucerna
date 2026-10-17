import posthog from "posthog-js";
import type { ScenarioDraft } from "@/lib/scenario/draft";
import type { AgentEvent, DemoConversation } from "./types";
import { API_URL } from "@/lib/utils/constants";

export interface AgentRequest {
  message: string;
  messages: unknown[];
  draft: ScenarioDraft;
}

/**
 * The visitor's PostHog ids, so the API's AI analytics for this message land on the
 * same person and session replay. Empty when PostHog isn't running.
 */
function posthogHeaders(): Record<string, string> {
  try {
    const headers: Record<string, string> = {};
    const distinctId = posthog.get_distinct_id?.();
    const sessionId = posthog.get_session_id?.();
    if (distinctId) headers["X-POSTHOG-DISTINCT-ID"] = distinctId;
    if (sessionId) headers["X-POSTHOG-SESSION-ID"] = sessionId;
    return headers;
  } catch {
    return {};
  }
}

/** Split a server-sent event buffer into complete events and the unfinished remainder. */
export function parseSseChunk(buffer: string): { events: AgentEvent[]; rest: string } {
  const events: AgentEvent[] = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as AgentEvent);
    } catch {
      // Ignore malformed events; the stream continues.
    }
  }
  return { events, rest };
}

/**
 * Send one message to the assistant and call `onEvent` for each streamed event.
 * Network failures surface as an `error` event with code "network" followed by `done`.
 */
export async function streamAgent(
  body: AgentRequest,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  let sawDone = false;
  const emit = (event: AgentEvent) => {
    if (event.type === "done") sawDone = true;
    onEvent(event);
  };
  try {
    const res = await fetch(`${API_URL}/api/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...posthogHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`API error: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;
      parsed.events.forEach(emit);
    }
    parseSseChunk(buffer + "\n\n").events.forEach(emit);
  } catch (err) {
    if (signal?.aborted) return;
    void err;
  }
  if (!sawDone && !signal?.aborted) {
    onEvent({
      type: "error",
      code: "network",
      message:
        "We couldn't reach the assistant. Your scenario is saved, so you can keep adjusting it and run the numbers yourself.",
    });
    onEvent({ type: "done", messages: [] });
  }
}

export async function fetchDemoConversation(): Promise<DemoConversation> {
  const res = await fetch(`${API_URL}/api/agent/demo`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
