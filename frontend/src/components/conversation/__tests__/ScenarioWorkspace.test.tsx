import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { sampleOptimizationResult } from "@/test/fixtures/optimization-result";
import type { AgentEvent } from "@/lib/agent/types";
import { EMPTY_DRAFT, type ScenarioDraft } from "@/lib/scenario/draft";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScenarioWorkspace } from "../ScenarioWorkspace";

vi.mock("next/navigation", () => ({ usePathname: () => "/calculator" }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

const API = "http://localhost:8000/api/agent";

const DRAFT: ScenarioDraft = {
  ...EMPTY_DRAFT,
  age: 52,
  filing_status: "married_filing_jointly",
  current_income: 90000,
  traditional_balance: 600000,
  retirement_age: 60,
  timeline: [
    { year: 2026, gross_income: 90000 },
    { year: 2027, gross_income: 92700 },
  ],
};

function sse(events: AgentEvent[]) {
  return new HttpResponse(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function mockAgent(sent: { message: string; draft: ScenarioDraft }[] = []) {
  server.use(
    http.post(API, async ({ request }) => {
      const body = (await request.json()) as { message: string; draft: ScenarioDraft };
      sent.push(body);
      if (/run the numbers/i.test(body.message)) {
        return sse([
          { type: "tool_start", name: "optimize_scenario", status: "Running the optimizer" },
          {
            type: "result",
            result_id: "r_0000000001",
            label: "Your scenario",
            result: sampleOptimizationResult,
          },
          { type: "part", part: { kind: "result_headline", result_id: "r_0000000001" } },
          { type: "text_delta", text: "The analysis shows **savings** in low-income years." },
          {
            type: "part",
            part: { kind: "suggestions", suggestions: ["What if I retire at 58?"] },
          },
          { type: "done", messages: [{ role: "user", content: "run" }] },
        ]);
      }
      return sse([
        { type: "tool_start", name: "update_scenario", status: "Updating your scenario" },
        { type: "draft", draft: DRAFT, missing: [] },
        { type: "text_delta", text: "Here's what I have." },
        { type: "part", part: { kind: "scenario_summary", draft: DRAFT, draft_hash: "abc" } },
        { type: "done", messages: [{ role: "user", content: "hi" }] },
      ]);
    })
  );
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/calculator");
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
});

function renderWorkspace(variant: "calculator" | "demo") {
  return render(
    <TooltipProvider>
      <ScenarioWorkspace variant={variant} />
    </TooltipProvider>
  );
}

async function sendMessage(text: string) {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

const panel = () => screen.getByRole("complementary", { name: "Your scenario" });

describe("ScenarioWorkspace (calculator)", () => {
  it("opens with an opening message, starters and an empty scenario beside it", () => {
    mockAgent();
    renderWorkspace("calculator");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText(/Let's map out your situation/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "How do Roth conversions work?" })
    ).toBeInTheDocument();
    expect(within(panel()).getByText("Add your details")).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Run the numbers" })).toBeDisabled();
    // On phones, a bar above the message box opens the same scenario.
    fireEvent.click(screen.getByRole("button", { name: /Review your scenario/ }));
    const sheet = screen.getByRole("dialog", { name: "Your scenario" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("starts the message box with a sample message that sends as is", async () => {
    const sent: { message: string; draft: ScenarioDraft }[] = [];
    mockAgent(sent);
    renderWorkspace("calculator");
    const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(box.value).toMatch(/^I'm 55 and single/);
    expect(box).toHaveClass("italic");
    expect(screen.getByText(/Sample message\. Change the numbers/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].message).toMatch(/^I'm 55 and single/);
    // After the first message the box is a plain follow-up box.
    await screen.findByTestId("scenario-note");
    expect(box.value).toBe("");
    expect(screen.queryByText(/Sample message/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear message" })).not.toBeInTheDocument();
  });

  it("lets the sample be edited into the person's own words or cleared", () => {
    mockAgent();
    renderWorkspace("calculator");
    const box = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: box.value.replace("55", "52") } });
    expect(box).not.toHaveClass("italic");
    expect(screen.queryByText(/Sample message/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear message" }));
    expect(box.value).toBe("");
    expect(box).toHaveAttribute("placeholder", "Describe your situation");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("asks a signed-out visitor to sign in before opening a saved scenario", () => {
    mockAgent();
    window.history.replaceState(null, "", "/calculator?saved=abc");
    renderWorkspace("calculator");
    expect(screen.getByText("Sign in to open this saved scenario")).toBeInTheDocument();
  });

  it("fills the panel from the conversation, runs it and opens full results", async () => {
    const sent: { message: string; draft: ScenarioDraft }[] = [];
    mockAgent(sent);
    renderWorkspace("calculator");

    await sendMessage("I'm 52, married, $90k income, $600k in my 401k, retiring at 60");
    // The conversation notes the change; the values themselves land in the panel.
    expect(await screen.findByTestId("scenario-note")).toHaveTextContent(
      "Added 5 details to your scenario"
    );
    expect(within(panel()).getByText("52")).toBeInTheDocument();
    expect(within(panel()).getByText("$600,000")).toBeInTheDocument();
    expect(within(panel()).getAllByText("New")).toHaveLength(5);
    expect(within(panel()).getByText("Ready to run")).toBeInTheDocument();

    // Edit a value in the panel: the shared draft changes and its "New" mark goes.
    fireEvent.click(within(panel()).getByRole("button", { name: "60" }));
    const input = within(panel()).getByLabelText("Start drawing at age");
    fireEvent.change(input, { target: { value: "62" } });
    fireEvent.blur(input);
    expect(within(panel()).getByRole("button", { name: "62" })).toBeInTheDocument();
    expect(within(panel()).getAllByText("New")).toHaveLength(4);

    fireEvent.click(within(panel()).getByRole("button", { name: "Run the numbers" }));
    const headline = await screen.findByTestId("result-headline");
    expect(within(headline).getByText(/\$28,500/)).toBeInTheDocument();
    expect(screen.getByText("savings")).toContainHTML("strong");
    expect(screen.getByRole("button", { name: "What if I retire at 58?" })).toBeInTheDocument();
    // The assistant ran the edited draft, and the panel knows it's current.
    expect(sent[1].message).toBe("Looks right. Run the numbers.");
    expect(sent[1].draft.retirement_age).toBe(62);
    expect(within(panel()).getByText("Up to date")).toBeInTheDocument();
    expect(within(panel()).queryByText("New")).not.toBeInTheDocument();

    fireEvent.click(within(panel()).getByRole("button", { name: "62" }));
    const again = within(panel()).getByLabelText("Start drawing at age");
    fireEvent.change(again, { target: { value: "63" } });
    fireEvent.blur(again);
    expect(within(panel()).getByText("Changes not run yet")).toBeInTheDocument();

    fireEvent.click(within(headline).getByRole("button", { name: "See full results" }));
    expect(screen.getByRole("button", { name: /Back to conversation/ })).toBeInTheDocument();
    expect(window.location.search).toContain("view=results");
    // The scenario stays beside the full results.
    expect(panel()).toBeInTheDocument();

    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(screen.getByTestId("result-headline")).toBeInTheDocument());
  });

  it("opens the full details from the panel", async () => {
    mockAgent();
    renderWorkspace("calculator");
    await sendMessage("I'm 52, married, $90k income, $600k in my 401k, retiring at 60");
    await screen.findByTestId("scenario-note");

    fireEvent.click(within(panel()).getByRole("button", { name: /Income in retirement/ }));
    expect(window.location.search).toContain("view=details&section=income");
    expect(screen.getByRole("heading", { name: "All the details." })).toBeInTheDocument();
    expect(screen.getByLabelText("Age")).toHaveValue("52");
    // The form is the whole scenario here, so the panel steps aside.
    expect(screen.queryByRole("complementary", { name: "Your scenario" })).toBeNull();
    expect(screen.getByRole("button", { name: "Run the numbers" })).toBeInTheDocument();

    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(screen.getByTestId("scenario-note")).toBeInTheDocument());
  });

  it("asks before clearing the conversation", async () => {
    mockAgent();
    renderWorkspace("calculator");
    await sendMessage("I'm 52, married, $90k income, $600k in my 401k, retiring at 60");
    await screen.findByTestId("scenario-note");

    fireEvent.click(await screen.findByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.getByTestId("scenario-note")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByTestId("scenario-note")).not.toBeInTheDocument();
    // Back to the opening line; the values gathered so far stay in the scenario.
    expect(screen.getByRole("button", { name: "Run my scenario" })).toBeInTheDocument();
    expect(within(panel()).getByText("52")).toBeInTheDocument();
  });

  it("runs the scenario itself when the assistant is unavailable", async () => {
    const sent: string[] = [];
    server.use(
      http.post(API, async ({ request }) => {
        sent.push(((await request.json()) as { message: string }).message);
        return sse([
          { type: "error", code: "unavailable", message: "The assistant is unavailable." },
          { type: "done", messages: [] },
        ]);
      })
    );
    sessionStorage.setItem("lucerna:draft:v1", JSON.stringify(DRAFT));
    renderWorkspace("calculator");
    await waitFor(() => expect(within(panel()).getByText("Ready to run")).toBeInTheDocument());

    // The first run finds the assistant down and runs on the engine instead.
    fireEvent.click(within(panel()).getByRole("button", { name: "Run the numbers" }));
    const back = await screen.findByRole("button", { name: /Back to conversation/ });
    expect(await screen.findAllByText(/\$28,500/)).not.toHaveLength(0);
    expect(within(panel()).getByText("Up to date")).toBeInTheDocument();
    fireEvent.click(back);
    expect(await screen.findByText("The assistant is unavailable.")).toBeInTheDocument();

    // After that, runs skip the assistant.
    fireEvent.click(within(panel()).getByRole("button", { name: "Run the numbers" }));
    expect(await screen.findByRole("button", { name: /Back to conversation/ })).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });

  it("restores the conversation from session storage", async () => {
    mockAgent();
    const { unmount } = renderWorkspace("calculator");
    await sendMessage("I'm 52");
    await screen.findByTestId("scenario-note");
    unmount();
    renderWorkspace("calculator");
    expect(await screen.findByTestId("scenario-note")).toBeInTheDocument();
    expect(screen.getByText("I'm 52")).toBeInTheDocument();
    expect(within(panel()).getByText("52")).toBeInTheDocument();
  });

  it("keeps follow-up chips below text that streamed after them", async () => {
    server.use(
      http.post(API, () =>
        sse([
          {
            type: "part",
            part: { kind: "suggestions", suggestions: ["What if I retire at 58?"] },
          },
          { type: "text_delta", text: "Here is the written answer." },
          { type: "done", messages: [{ role: "user", content: "hi" }] },
        ])
      )
    );
    renderWorkspace("calculator");
    await sendMessage("What assumptions does it make?");
    const chip = await screen.findByRole("button", { name: "What if I retire at 58?" });
    const answer = screen.getByText("Here is the written answer.");
    expect(answer.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ScenarioWorkspace (full results links)", () => {
  const LINK = "/calculator?view=results&result=r_0000000009&scenario=eyJhZ2UiOjUyfQ&label=Retire";

  it("rebuilds a linked scenario and opens its results", async () => {
    const requests: unknown[] = [];
    server.use(
      http.post("http://localhost:8000/api/scenario-links/open", async ({ request }) => {
        requests.push(await request.json());
        return HttpResponse.json({
          result_id: "r_0000000009",
          label: "Retire",
          draft: DRAFT,
          result: sampleOptimizationResult,
        });
      })
    );
    window.history.replaceState(null, "", LINK);
    renderWorkspace("calculator");
    expect(screen.getByText("Opening your results…")).toBeInTheDocument();
    const back = await screen.findByRole("button", { name: /Back to conversation/ });
    expect(requests).toEqual([{ scenario: "eyJhZ2UiOjUyfQ", label: "Retire" }]);
    // The scenario stays in the address so the link can still be shared.
    expect(window.location.search).toContain("scenario=eyJhZ2UiOjUyfQ");
    expect(JSON.parse(sessionStorage.getItem("lucerna:draft:v1")!).age).toBe(52);
    // Back returns to the conversation on this page, not to whatever came before.
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {
      window.history.replaceState(null, "", "/calculator");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    fireEvent.click(back);
    expect(backSpy).toHaveBeenCalled();
    expect(await screen.findByLabelText("Message")).toBeInTheDocument();
    backSpy.mockRestore();
  });

  it("says so when a link can't be opened", async () => {
    server.use(
      http.post("http://localhost:8000/api/scenario-links/open", () =>
        HttpResponse.json({ detail: "bad" }, { status: 400 })
      )
    );
    window.history.replaceState(null, "", LINK);
    renderWorkspace("calculator");
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be opened");
  });
});

describe("ScenarioWorkspace (demo)", () => {
  it("replays the example conversation and then accepts follow-ups", async () => {
    server.use(
      http.get(`${API}/demo`, () =>
        HttpResponse.json({
          persona: { name: "Margaret", age: 63, occupation: "Nurse", situation: "" },
          exchanges: [
            {
              user: "Hi, I'm Margaret.",
              events: [
                { type: "draft", draft: DRAFT, missing: [] },
                { type: "part", part: { kind: "scenario_summary", draft: DRAFT, draft_hash: "a" } },
              ],
            },
            {
              user: "Run the numbers.",
              events: [
                {
                  type: "result",
                  result_id: "r_0000000001",
                  label: "Your scenario",
                  result: sampleOptimizationResult,
                },
                { type: "part", part: { kind: "result_headline", result_id: "r_0000000001" } },
                { type: "text_delta", text: "Margaret's window is open." },
              ],
            },
          ],
          messages: [{ role: "user", content: "x" }],
          draft: DRAFT,
          source: "scripted",
          cache_key: "k",
        })
      )
    );
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true, // reduced motion: replay instantly
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    renderWorkspace("demo");
    expect(await screen.findByText("Margaret's window is open.")).toBeInTheDocument();
    expect(screen.getByText("Hi, I'm Margaret.")).toBeInTheDocument();
    const ctaBand = screen.getByText("Ready to try yours?").parentElement!.parentElement!;
    // The wash is an absolute overlay; on the band itself it pulls the band out of flow.
    expect(ctaBand).toHaveClass("bg-pine-deep");
    expect(ctaBand).not.toHaveClass("dark-wash");
    expect(screen.getByLabelText("Message")).not.toBeDisabled();
    // Margaret's scenario sits beside her conversation, read only.
    const demoPanel = screen.getByRole("complementary", { name: "Margaret's scenario" });
    expect(within(demoPanel).getByText("52")).toBeInTheDocument();
    expect(within(demoPanel).queryByRole("button", { name: "Run the numbers" })).toBeNull();
  });
});
