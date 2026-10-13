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
    expect(screen.queryByTestId("latest-turn")).toBeNull();

    const next = stateWith([...first.messages, user("u2", "What if I retire at 58?")]);
    rerender(
      <ConversationContext.Provider value={context}>
        <ConversationThread state={next} followKey={1} />
      </ConversationContext.Provider>
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toHaveTextContent("What if I retire at 58?");
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    expect(screen.getByTestId("latest-turn")).toHaveTextContent("What if I retire at 58?");
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
    expect(screen.queryByTestId("latest-turn")).toBeNull();
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
