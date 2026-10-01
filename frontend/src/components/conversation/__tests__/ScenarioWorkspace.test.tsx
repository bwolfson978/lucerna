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

describe("ScenarioWorkspace (calculator)", () => {
  it("opens in conversation mode with an opening message and starters", () => {
    mockAgent();
    renderWorkspace("calculator");
    expect(screen.getByRole("radio", { name: "Talk it through" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByText(/Let's map out your situation/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "I'm planning to retire early" })
    ).toBeInTheDocument();
  });

  it("gathers inputs, confirms, runs and opens full results", async () => {
    const sent: { message: string; draft: ScenarioDraft }[] = [];
    mockAgent(sent);
    renderWorkspace("calculator");

    await sendMessage("I'm 52, married, $90k income, $600k in my 401k, retiring at 60");
    const summary = await screen.findByTestId("scenario-summary");
    expect(within(summary).getByText("52")).toBeInTheDocument();
    expect(within(summary).getByText("$600,000")).toBeInTheDocument();

    // Edit a value on the card: the shared draft changes.
    fireEvent.click(within(summary).getByRole("button", { name: "60" }));
    const input = within(summary).getByLabelText("Start drawing at age");
    fireEvent.change(input, { target: { value: "62" } });
    fireEvent.blur(input);
    expect(within(summary).getByRole("button", { name: "62" })).toBeInTheDocument();

    fireEvent.click(within(summary).getByRole("button", { name: "Run the numbers" }));
    const headline = await screen.findByTestId("result-headline");
    expect(within(headline).getByText(/\$28,500/)).toBeInTheDocument();
    expect(screen.getByText("savings")).toContainHTML("strong");
    expect(screen.getByRole("button", { name: "What if I retire at 58?" })).toBeInTheDocument();
    // The edited draft went to the backend with the confirmation.
    expect(sent[1].draft.retirement_age).toBe(62);
    // Once run, the summary card is read-only.
    expect(screen.getByText("Confirmed")).toBeInTheDocument();

    fireEvent.click(within(headline).getByRole("button", { name: "See full results" }));
    expect(screen.getByRole("button", { name: /Back to conversation/ })).toBeInTheDocument();
    expect(window.location.search).toContain("view=results");

    await act(async () => {
      window.history.back();
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(screen.getByTestId("result-headline")).toBeInTheDocument());

    // The form shows what the conversation captured.
    fireEvent.click(screen.getByRole("radio", { name: "Fill in a form" }));
    expect(screen.getByLabelText("Age")).toHaveValue("52");
  });

  it("falls back to the form when the assistant is unavailable", async () => {
    server.use(
      http.post(API, () =>
        sse([
          { type: "error", code: "unavailable", message: "The assistant is unavailable." },
          { type: "done", messages: [] },
        ])
      )
    );
    renderWorkspace("calculator");
    await sendMessage("hello");
    expect(
      await screen.findByText(/Everything you told it is filled in below/)
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Fill in a form" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("restores the conversation from session storage", async () => {
    mockAgent();
    const { unmount } = renderWorkspace("calculator");
    await sendMessage("I'm 52");
    await screen.findByTestId("scenario-summary");
    unmount();
    renderWorkspace("calculator");
    expect(await screen.findByTestId("scenario-summary")).toBeInTheDocument();
    expect(screen.getByText("I'm 52")).toBeInTheDocument();
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
    expect(screen.getByText("Ready to try yours?")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Fill in a form" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Message")).not.toBeDisabled();
  });
});
