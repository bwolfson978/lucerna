import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import type { AgentEvent } from "@/lib/agent/types";
import { EMPTY_DRAFT, type ScenarioDraft } from "@/lib/scenario/draft";
import { useConversation } from "../useConversation";

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
