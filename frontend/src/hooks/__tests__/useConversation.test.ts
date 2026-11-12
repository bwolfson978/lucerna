import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import type { AgentEvent, DemoConversation } from "@/lib/agent/types";
import { EMPTY_DRAFT, type ScenarioDraft } from "@/lib/scenario/draft";
import { useConversation, type ReplayStop } from "../useConversation";

const API = "http://localhost:8000/api/agent";

const sse = (events: AgentEvent[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");

describe("useConversation edit", () => {
  it("reruns from the edited message with the history and scenario from before it", async () => {
    const bodies: { message: string; messages: unknown[]; draft: ScenarioDraft }[] = [];
    server.use(
      http.post(API, async ({ request }) => {
        const body = (await request.json()) as (typeof bodies)[number];
        bodies.push(body);
        return new HttpResponse(
          sse([
            { type: "text_delta", text: `Reply ${bodies.length}` },
            {
              type: "done",
              messages: [
                { role: "user", content: body.message },
                { role: "assistant", content: `Reply ${bodies.length}` },
              ],
            },
          ]),
          { headers: { "Content-Type": "text/event-stream" } }
        );
      })
    );

    let draft: ScenarioDraft = { ...EMPTY_DRAFT, filing_status: "single" };
    const onRewind = vi.fn((d: ScenarioDraft) => {
      draft = d;
    });
    const { result } = renderHook(() =>
      useConversation({
        getDraft: () => draft,
        onDraft: vi.fn(),
        onRewind,
        surface: "test",
      })
    );

    await act(() => result.current.send("I'm single"));
    // The assistant (or the person) changes the scenario after the first message.
    draft = { ...EMPTY_DRAFT, filing_status: "married_filing_jointly" };
    await act(() => result.current.send("Run it"));
    expect(result.current.state.apiMessages).toHaveLength(4);

    const second = result.current.state.messages[2];
    await act(() => result.current.edit(second.id, "Run it at 62"));

    expect(onRewind).toHaveBeenCalledWith({
      ...EMPTY_DRAFT,
      filing_status: "married_filing_jointly",
    });
    const sent = bodies[2];
    expect(sent.message).toBe("Run it at 62");
    expect(sent.messages).toHaveLength(2);
    const { messages, apiMessages } = result.current.state;
    expect(messages.map((m) => (m.parts[0] as { text: string }).text)).toEqual([
      "I'm single",
      "Reply 1",
      "Run it at 62",
      "Reply 3",
    ]);
    expect(apiMessages).toHaveLength(4);

    // Editing the first message puts back the scenario from before it.
    await act(() => result.current.edit(messages[0].id, "We file jointly"));
    expect(onRewind).toHaveBeenLastCalledWith({ ...EMPTY_DRAFT, filing_status: "single" });
    expect(bodies[3].messages).toEqual([]);
    expect(result.current.state.messages).toHaveLength(2);
  });
});

describe("useConversation replay", () => {
  const demo: DemoConversation = {
    persona: { name: "Margaret", age: 63, occupation: "nurse", situation: "" },
    exchanges: [
      {
        user: "Hi, I'm Margaret",
        events: [
          { type: "tool_start", name: "prepare_scenario", status: "Updating your scenario" },
          { type: "text_delta", text: "Here is what I recorded." },
        ],
      },
      {
        user: "Run the numbers",
        events: [
          {
            type: "part",
            part: {
              kind: "mcp_app",
              resource_uri: "ui://roth-conversions/result-card.html",
              tool_name: "analyze_roth_conversions",
              tool_input: {},
              tool_result: {},
            },
          },
          { type: "text_delta", text: "The analysis shows savings." },
        ],
      },
    ],
    messages: [{ role: "user", content: "Hi" }],
    draft: EMPTY_DRAFT,
    source: "scripted",
    cache_key: "k",
  };

  const render = () =>
    renderHook(() =>
      useConversation({ getDraft: () => EMPTY_DRAFT, onDraft: vi.fn(), surface: "test" })
    );

  it("waits at each stop until the tour lets it go on", async () => {
    vi.useFakeTimers();
    try {
      const stops: ReplayStop[] = [];
      let release: (() => void) | null = null;
      const pause = (stop: ReplayStop) => {
        stops.push(stop);
        // Hold playback only once Margaret's first message is on screen.
        if (stop.exchange !== 0 || stop.at !== "asked") return Promise.resolve();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      };
      const { result } = render();
      let done = false;
      act(() => {
        void result.current.replay(demo, { animate: true, pause }).then(() => {
          done = true;
        });
      });

      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(result.current.state.messages).toHaveLength(2);
      expect(result.current.state.messages[1].parts).toHaveLength(0);
      expect(done).toBe(false);

      release!();
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(done).toBe(true);
      expect(stops.map((s) => `${s.exchange}:${s.at}`)).toEqual([
        "0:before",
        "0:asked",
        "0:answered",
        "1:before",
        "1:asked",
        "1:card",
        "1:answered",
      ]);
      expect(stops.map((s) => s.last)).toEqual([false, false, false, true, true, true, true]);
      expect(result.current.state.messages).toHaveLength(4);
      expect(result.current.state.apiMessages).toEqual(demo.messages);
    } finally {
      vi.useRealTimers();
    }
  });

  it("plays straight through without stops when motion is reduced", async () => {
    const pause = vi.fn(() => new Promise<void>(() => {}));
    const { result } = render();
    await act(() => result.current.replay(demo, { animate: false, pause }));
    expect(pause).not.toHaveBeenCalled();
    expect(result.current.state.messages).toHaveLength(4);
    expect(result.current.state.streaming).toBe(false);
  });
});
