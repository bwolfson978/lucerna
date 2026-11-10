import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("re-measures the spacer from the messages, never from a box that holds the spacer", () => {
    // A ResizeObserver whose callback resizes what it watches loops, and the browser
    // reports "ResizeObserver loop completed with undelivered notifications".
    const observed: Element[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      renderThread(stateWith([user("u1", "Hi"), assistant("a1", "Hello")]), { followKey: 1 });
    } finally {
      globalThis.ResizeObserver = original;
    }
    const spacer = screen.getByTestId("turn-spacer");
    expect(observed).toHaveLength(1);
    expect(observed[0]).toHaveTextContent("Hello");
    expect(observed[0].contains(spacer)).toBe(false);
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

  describe("copy and edit", () => {
    const editable = (id: string, text: string, apiIndex: number): UiMessage => ({
      ...user(id, text),
      apiIndex,
    });

    it("copies a message's text", async () => {
      const ue = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
      renderThread(stateWith([user("u1", "I was born in 1971"), assistant("a1", "Thanks")]), {});
      await ue.click(screen.getByRole("button", { name: "Copy" }));
      expect(writeText).toHaveBeenCalledWith("I was born in 1971");
      expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    });

    it("offers Edit only on messages that can be rerun", () => {
      render(
        <ConversationContext.Provider value={context}>
          <ConversationThread
            state={stateWith([
              user("u1", "Hi, I'm Margaret"),
              assistant("a1", "Hello"),
              editable("u2", "What if I retire at 58?", 4),
              assistant("a2", "Here it is"),
            ])}
            onEdit={vi.fn()}
          />
        </ConversationContext.Provider>
      );
      expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    });

    it("sends the edited text, or puts the message back on Cancel and Escape", async () => {
      const ue = userEvent.setup();
      const onEdit = vi.fn();
      render(
        <ConversationContext.Provider value={context}>
          <ConversationThread
            state={stateWith([editable("u1", "I'm single", 0), assistant("a1", "Noted")])}
            onEdit={onEdit}
          />
        </ConversationContext.Provider>
      );
      await ue.click(screen.getByRole("button", { name: "Edit" }));
      const box = screen.getByRole("textbox", { name: "Edit your message" });
      expect(box).toHaveFocus();
      expect(box).toHaveValue("I'm single");

      await ue.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("textbox", { name: "Edit your message" })).toBeNull();
      expect(screen.getByText("I'm single")).toBeInTheDocument();

      await ue.click(screen.getByRole("button", { name: "Edit" }));
      await ue.keyboard("{Escape}");
      expect(screen.queryByRole("textbox", { name: "Edit your message" })).toBeNull();

      await ue.click(screen.getByRole("button", { name: "Edit" }));
      const again = screen.getByRole("textbox", { name: "Edit your message" });
      await ue.clear(again);
      expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
      await ue.type(again, "We file jointly");
      await ue.click(screen.getByRole("button", { name: "Send" }));
      expect(onEdit).toHaveBeenCalledWith("u1", "We file jointly");
      expect(screen.queryByRole("textbox", { name: "Edit your message" })).toBeNull();
    });

    it("waits for the reply before a message can be edited", () => {
      render(
        <ConversationContext.Provider value={context}>
          <ConversationThread
            state={{
              ...stateWith([editable("u1", "Hi", 0), assistant("a1", "")]),
              streaming: true,
            }}
            onEdit={vi.fn()}
          />
        </ConversationContext.Provider>
      );
      expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    });

    it("brings an edited message to the top, like a new one", () => {
      const before = stateWith([
        editable("u1", "Hi", 0),
        assistant("a1", "Hello"),
        editable("u2", "Retire at 58", 2),
        assistant("a2", "Done"),
      ]);
      const { rerender } = renderThread(before, { followKey: 1 });
      scrollIntoView.mockClear();
      rerender(
        <ConversationContext.Provider value={context}>
          <ConversationThread
            state={stateWith([...before.messages.slice(0, 2), editable("u3", "Retire at 60", 2)])}
            followKey={2}
          />
        </ConversationContext.Provider>
      );
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toHaveTextContent("Retire at 60");
    });
  });
});

describe("rating replies", () => {
  const rated = (extra: Partial<UiMessage> = {}): ConversationState =>
    stateWith([user("u1", "Hi"), { ...assistant("a1", "Hello"), ...extra }]);

  function renderRateable(state: ConversationState, onRate = vi.fn()) {
    render(
      <ConversationContext.Provider value={context}>
        <ConversationThread state={state} onRate={onRate} />
      </ConversationContext.Provider>
    );
    return onRate;
  }

  it("shows thumbs under a finished reply that has a trace id", async () => {
    const onRate = renderRateable(rated({ traceId: "t1" }));
    await userEvent.click(screen.getByRole("button", { name: "Good reply" }));
    expect(onRate).toHaveBeenCalledWith("a1", { value: "up" });
  });

  it("shows none without a trace id, while streaming, or on a reply with no text", () => {
    renderRateable(rated());
    renderRateable({ ...rated({ traceId: "t1" }), streaming: true });
    renderRateable(
      stateWith([user("u1", "Hi"), { id: "a1", role: "assistant", traceId: "t1", parts: [] }])
    );
    expect(screen.queryByRole("button", { name: "Good reply" })).not.toBeInTheDocument();
  });
});
