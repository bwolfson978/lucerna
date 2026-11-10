import { http, HttpResponse } from "msw";
import posthog from "posthog-js";
import { server } from "@/test/mocks/server";
import { parseSseChunk, streamAgent } from "../client";
import {
  INITIAL_CONVERSATION,
  conversationReducer,
  editPoint,
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

  it("sends the visitor's PostHog ids for the API's AI analytics", async () => {
    vi.spyOn(posthog, "get_distinct_id").mockReturnValue("visitor-1");
    vi.spyOn(posthog, "get_session_id").mockReturnValue("session-1");
    let headers: Headers | undefined;
    server.use(
      http.post(API, ({ request }) => {
        headers = request.headers;
        return new HttpResponse(sse([{ type: "done", messages: [] }]), {
          headers: { "Content-Type": "text/event-stream" },
        });
      })
    );
    await streamAgent({ message: "hello", messages: [], draft: EMPTY_DRAFT }, () => {});
    expect(headers?.get("x-posthog-distinct-id")).toBe("visitor-1");
    expect(headers?.get("x-posthog-session-id")).toBe("session-1");
    vi.restoreAllMocks();
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

describe("editing a message", () => {
  const draftA = { ...EMPTY_DRAFT, filing_status: "single" as const };
  const draftB = { ...EMPTY_DRAFT, filing_status: "married_filing_jointly" as const };

  function twoTurns(): ConversationState {
    let state = conversationReducer(INITIAL_CONVERSATION, {
      type: "user",
      id: "1",
      text: "I'm single",
      draft: draftA,
    });
    state = conversationReducer(state, {
      type: "event",
      event: { type: "done", messages: [{ role: "user" }, { role: "assistant" }] },
    });
    state = conversationReducer(state, {
      type: "user",
      id: "2",
      text: "Run it",
      draft: draftB,
    });
    return conversationReducer(state, {
      type: "event",
      event: {
        type: "done",
        messages: [
          { role: "user" },
          { role: "assistant" },
          { role: "user" },
          { role: "assistant" },
        ],
      },
    });
  }

  it("records where each message starts in the API history", () => {
    const state = twoTurns();
    expect(state.messages.map((m) => m.apiIndex)).toEqual([0, undefined, 2, undefined]);
    expect(state.messages[2].draft).toEqual(draftB);
    expect(editPoint(state, "2-u")).toEqual({
      apiMessages: state.apiMessages.slice(0, 2),
      draft: draftB,
    });
    expect(editPoint(state, "1-a")).toBeNull();
  });

  it("replaces the message and everything after it, and rewinds the history", () => {
    const state = conversationReducer(twoTurns(), {
      type: "edit",
      messageId: "1-u",
      id: "3",
      text: "We file jointly",
      draft: draftA,
    });
    expect(state.messages.map((m) => m.id)).toEqual(["3-u", "3-a"]);
    expect(state.messages[0].parts).toEqual([{ kind: "text", text: "We file jointly" }]);
    expect(state.messages[0].apiIndex).toBe(0);
    expect(state.apiMessages).toEqual([]);
    expect(state.streaming).toBe(true);

    const done = conversationReducer(state, {
      type: "event",
      event: { type: "done", messages: [{ role: "user" }, { role: "assistant" }] },
    });
    expect(done.apiMessages).toHaveLength(2);
    expect(userMessageCount(done)).toBe(1);
  });

  it("keeps the turns before the edited message", () => {
    const state = conversationReducer(twoTurns(), {
      type: "edit",
      messageId: "2-u",
      id: "3",
      text: "Run it at 62",
    });
    expect(state.messages.map((m) => m.id)).toEqual(["1-u", "1-a", "3-u", "3-a"]);
    expect(state.apiMessages).toHaveLength(2);
    expect(state.messages[2].apiIndex).toBe(2);
  });

  it("leaves replayed turns and turns in progress alone", () => {
    const replayed = conversationReducer(INITIAL_CONVERSATION, {
      type: "user",
      id: "1",
      text: "Hi, I'm Margaret",
      replay: true,
    });
    expect(replayed.messages[0].apiIndex).toBeUndefined();
    expect(editPoint(replayed, "1-u")).toBeNull();
    const done = conversationReducer(replayed, {
      type: "event",
      event: { type: "done", messages: [] },
    });
    expect(conversationReducer(done, { type: "edit", messageId: "1-u", id: "2", text: "x" })).toBe(
      done
    );

    const streaming = conversationReducer(INITIAL_CONVERSATION, {
      type: "user",
      id: "1",
      text: "Hi",
    });
    expect(
      conversationReducer(streaming, { type: "edit", messageId: "1-u", id: "2", text: "x" })
    ).toBe(streaming);
  });

  it("keeps what lets a restored conversation be edited", () => {
    const store: Record<string, string> = {};
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => {
      store[k] = v;
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((k) => store[k] ?? null);
    saveConversation("k", twoTurns());
    const restored = loadConversation("k");
    vi.restoreAllMocks();
    expect(restored && editPoint(restored, "2-u")?.apiMessages).toHaveLength(2);
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
