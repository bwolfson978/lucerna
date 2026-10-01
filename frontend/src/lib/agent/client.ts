import type { ScenarioDraft } from "@/lib/scenario/draft";
import type { AgentEvent, DemoConversation } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface AgentRequest {
  message: string;
  messages: unknown[];
  draft: ScenarioDraft;
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
    const res = await fetch(`${API_BASE}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
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
        "We couldn't reach the assistant. Your scenario is saved in the form, where you can keep working.",
    });
    onEvent({ type: "done", messages: [] });
  }
}

export async function fetchDemoConversation(): Promise<DemoConversation> {
  const res = await fetch(`${API_BASE}/api/agent/demo`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
