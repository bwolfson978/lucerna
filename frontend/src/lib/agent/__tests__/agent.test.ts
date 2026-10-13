import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { parseSseChunk, streamAgent } from "../client";
import {
  INITIAL_CONVERSATION,
  conversationReducer,
  latestResultId,
  loadConversation,
  saveConversation,
  userMessageCount,
  wordChunks,
  type ConversationState,
} from "../conversation";
import type { AgentEvent } from "../types";
import { EMPTY_DRAFT } from "@/lib/scenario/draft";
import { sampleOptimizationResult } from "@/test/fixtures/optimization-result";

const API = "http://localhost:8000/api/agent";

function sse(events: AgentEvent[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

describe("parseSseChunk", () => {
  it("returns complete events and keeps the partial remainder", () => {
    const { events, rest } = parseSseChunk(
      'data: {"type":"text_delta","text":"Hi"}\n\ndata: {"type":"te'
    );
    expect(events).toEqual([{ type: "text_delta", text: "Hi" }]);
    expect(rest).toBe('data: {"type":"te');
  });

  it("skips malformed events", () => {
    expect(parseSseChunk("data: nope\n\n").events).toEqual([]);
  });
});

describe("streamAgent", () => {
  it("emits each streamed event", async () => {
    server.use(
      http.post(API, async ({ request }) => {
        const body = (await request.json()) as { message: string };
        expect(body.message).toBe("hello");
        return new HttpResponse(
          sse([
            { type: "text_delta", text: "Hi " },
            { type: "text_delta", text: "there" },
            { type: "done", messages: [{ role: "user" }] },
          ]),
          { headers: { "Content-Type": "text/event-stream" } }
        );
      })
    );
    const events: AgentEvent[] = [];
    await streamAgent({ message: "hello", messages: [], draft: EMPTY_DRAFT }, (e) =>
      events.push(e)
    );
    expect(events.map((e) => e.type)).toEqual(["text_delta", "text_delta", "done"]);
  });

  it("reports a network error when the stream ends without done", async () => {
    server.use(http.post(API, () => HttpResponse.error()));
    const events: AgentEvent[] = [];
    await streamAgent({ message: "hello", messages: [], draft: EMPTY_DRAFT }, (e) =>
      events.push(e)
    );
    expect(events[0]).toMatchObject({ type: "error", code: "network" });
    expect(events[1]).toEqual({ type: "done", messages: [] });
  });
});

describe("conversationReducer", () => {
  function run(events: AgentEvent[], start: ConversationState = INITIAL_CONVERSATION) {
    let state = conversationReducer(start, { type: "user", id: "1", text: "Hi" });
    for (const event of events) state = conversationReducer(state, { type: "event", event });
    return state;
  }

  it("joins text deltas and starts a new block after tools and cards", () => {
    const state = run([
      { type: "text_delta", text: "Hello " },
      { type: "text_delta", text: "there." },
      { type: "tool_start", name: "show", status: "Preparing a chart" },
      { type: "part", part: { kind: "suggestions", suggestions: ["What if?"] } },
      { type: "text_delta", text: "More." },
      { type: "done", messages: [{ role: "user" }, { role: "assistant" }] },
    ]);
    const parts = state.messages[1].parts;
    expect(parts).toEqual([
      { kind: "text", text: "Hello there." },
      { kind: "suggestions", suggestions: ["What if?"] },
      { kind: "text", text: "More." },
    ]);
    expect(state.streaming).toBe(false);
    expect(state.apiMessages).toHaveLength(2);
    expect(userMessageCount(state)).toBe(1);
  });

  it("stores results and finds the latest one", () => {
    const state = run([
      {
        type: "result",
        result_id: "r_1",
        label: "Your scenario",
        result: sampleOptimizationResult,
      },
      { type: "part", part: { kind: "result_headline", result_id: "r_1" } },
      { type: "done", messages: [] },
    ]);
    expect(state.results.r_1.input).toBe(sampleOptimizationResult.input);
    expect(latestResultId(state)).toBe("r_1");
  });

  it("shows errors as notices and tracks status", () => {
    let state = conversationReducer(INITIAL_CONVERSATION, { type: "user", id: "1", text: "Hi" });
    state = conversationReducer(state, {
      type: "event",
      event: { type: "tool_start", name: "optimize_scenario", status: "Running the optimizer" },
    });
    expect(state.status).toBe("Running the optimizer");
    state = conversationReducer(state, {
      type: "event",
      event: { type: "error", code: "unavailable", message: "Unavailable" },
    });
    expect(state.messages[1].parts[0]).toEqual({
      kind: "notice",
      code: "unavailable",
      message: "Unavailable",
    });
  });
});

describe("session persistence", () => {
  it("round-trips and drops results when storage is full", () => {
    const state = run();
    saveConversation("k", state);
    expect(loadConversation("k")?.results.r_1.result).not.toBeNull();

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    saveConversation("k2", state);
    setItem.mockRestore();
    const slim = loadConversation("k2");
    expect(slim?.results.r_1.result).toBeNull();
    expect(slim?.results.r_1.input).toEqual(sampleOptimizationResult.input);
  });

  function run(): ConversationState {
    let state = conversationReducer(INITIAL_CONVERSATION, { type: "user", id: "1", text: "Hi" });
    state = conversationReducer(state, {
      type: "event",
      event: {
        type: "result",
        result_id: "r_1",
        label: "Your scenario",
        result: sampleOptimizationResult,
      },
    });
    return conversationReducer(state, { type: "event", event: { type: "done", messages: [] } });
  }
});

describe("wordChunks", () => {
  it("keeps the whitespace a model delta starts with", () => {
    // Recorded deltas look like this: the space or newline comes first.
    for (const delta of [
      " stops there.",
      "\n- 2026 and 2027",
      " in",
      "  a  b  ",
      "\n\n",
      "",
      "word",
    ]) {
      expect(wordChunks(delta).join("")).toBe(delta);
    }
    expect(wordChunks(" stops there.")).toEqual([" stops ", "there."]);
  });
});
