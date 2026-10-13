import { render, screen } from "@testing-library/react";
import { INITIAL_CONVERSATION, type ConversationState } from "@/lib/agent/conversation";
import type { UiMessage } from "@/lib/agent/types";
import { ConversationContext, type ConversationContextValue } from "../ConversationContext";
import { ConversationThread } from "../ConversationThread";

const user = (id: string, text: string): UiMessage => ({
  id,
  role: "user",
  parts: [{ kind: "text", text }],
});
const assistant = (id: string, text: string): UiMessage => ({
  id,
  role: "assistant",
  parts: [{ kind: "text", text }],
});

function stateWith(messages: UiMessage[]): ConversationState {
  return { ...INITIAL_CONVERSATION, messages };
}

const context = {
  results: {},
  draft: {},
  streaming: false,
  send: vi.fn(),
  editDraft: vi.fn(),
  openResults: vi.fn(),
  ensureResult: vi.fn(),
} as unknown as ConversationContextValue;

function renderThread(
  state: ConversationState,
  props: { followKey?: number; followOnRestore?: boolean }
) {
  return render(
    <ConversationContext.Provider value={context}>
      <ConversationThread state={state} {...props} />
    </ConversationContext.Provider>
  );
}

let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element["scrollIntoView"];
});

describe("ConversationThread", () => {
  it("brings a message the person sent to the top, with room for the reply", () => {
    const first = stateWith([user("u1", "Hi"), assistant("a1", "Hello")]);
    const { rerender } = renderThread(first, { followKey: 0 });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("turn-spacer").style.height).toBe("0px");
    const earlier = screen.getByText("Hello");

    const next = stateWith([...first.messages, user("u2", "What if I retire at 58?")]);
    rerender(
      <ConversationContext.Provider value={context}>
        <ConversationThread state={next} followKey={1} />
      </ConversationContext.Provider>
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toHaveTextContent("What if I retire at 58?");
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    // Room below the question for the reply to arrive into.
    expect(screen.getByTestId("turn-spacer").style.height).not.toBe("0px");
    // Earlier messages stay mounted (their cards don't reload) when a turn starts.
    expect(screen.getByText("Hello")).toBe(earlier);
  });

  it("keeps the previous turn mounted when the next one is sent", () => {
    const sent = stateWith([user("u1", "Hi"), assistant("a1", "Here's your scenario")]);
    const { rerender } = renderThread(sent, { followKey: 1 });
    const reply = screen.getByText("Here's your scenario");

    rerender(
      <ConversationContext.Provider value={context}>
        <ConversationThread
          state={stateWith([...sent.messages, user("u2", "Run it")])}
          followKey={2}
        />
      </ConversationContext.Provider>
    );
    expect(screen.getByText("Here's your scenario")).toBe(reply);
  });

  it("leaves the scroll position alone when messages arrive from a replay", () => {
    const { rerender } = renderThread(stateWith([]), { followKey: 0 });
    rerender(
      <ConversationContext.Provider value={context}>
        <ConversationThread
          state={stateWith([user("u1", "Hi, I'm Margaret"), assistant("a1", "Hello")])}
          followKey={0}
        />
      </ConversationContext.Provider>
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("turn-spacer").style.height).toBe("0px");
  });

  it("returns to the last message when a saved conversation is restored", () => {
    const { rerender } = renderThread(stateWith([]), { followOnRestore: true });
    rerender(
      <ConversationContext.Provider value={context}>
        <ConversationThread
          state={stateWith([
            user("u1", "Hi"),
            assistant("a1", "Hello"),
            user("u2", "Run it"),
            assistant("a2", "Done"),
          ])}
          followOnRestore
        />
      </ConversationContext.Provider>
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toHaveTextContent("Run it");
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });
});
