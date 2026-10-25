/**
 * A scenario keeps one saved copy: later runs overwrite it, and only an explicit start
 * (Start over, New scenario) saves a new one.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { sampleOptimizationResult } from "@/test/fixtures/optimization-result";
import type { AgentEvent } from "@/lib/agent/types";
import { EMPTY_DRAFT } from "@/lib/scenario/draft";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScenarioWorkspace } from "../ScenarioWorkspace";

vi.mock("next/navigation", () => ({ usePathname: () => "/calculator" }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/auth", () => ({
  AUTH_ENABLED: true,
  useUser: () => ({ isLoaded: true, isSignedIn: auth.signedIn, user: null }),
  useAuth: () => ({ getToken: async () => "token" }),
  useSignOut: () => () => {},
  useAccountProfile: () => ({ name: "Barry", email: "you@example.com", signIn: "Google" }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

const API = "http://localhost:8000";
const DRAFT = {
  ...EMPTY_DRAFT,
  birth_year: new Date().getFullYear() - 52,
  birth_month: 6,
  filing_status: "married_filing_jointly",
  spouse_birth_year: new Date().getFullYear() - 52,
  spouse_birth_month: 3,
  current_income: 90000,
  traditional_balance: 600000,
  retirement_age: 60,
  timeline: [{ year: 2026, gross_income: 90000 }],
};

type Call = { method: string; path: string; body: { draft?: { birth_year?: number } } };

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function setUp({ updateStatus = 200 }: { updateStatus?: number } = {}) {
  auth.signedIn = true;
  sessionStorage.clear();
  window.history.replaceState(null, "", "/calculator");
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.setItem("lucerna:draft:v1", JSON.stringify(DRAFT));
  const calls: Call[] = [];
  const events: AgentEvent[] = [
    {
      type: "result",
      result_id: "r_0000000001",
      label: "Your scenario",
      result: sampleOptimizationResult,
    },
    { type: "part", part: { kind: "result_headline", result_id: "r_0000000001" } },
    { type: "done", messages: [{ role: "user", content: "run" }] },
  ];
  server.use(
    http.post(
      `${API}/api/agent`,
      () =>
        new HttpResponse(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
          headers: { "Content-Type": "text/event-stream" },
        })
    ),
    http.post(`${API}/api/optimize`, () => HttpResponse.json(sampleOptimizationResult)),
    http.post(`${API}/api/scenarios`, async ({ request }) => {
      calls.push({
        method: "POST",
        path: "/api/scenarios",
        body: (await request.json()) as Call["body"],
      });
      return HttpResponse.json({ id: `new-${calls.length}`, name: "Saved" });
    }),
    http.put(`${API}/api/scenarios/:id`, async ({ request, params }) => {
      calls.push({
        method: "PUT",
        path: `/api/scenarios/${params.id}`,
        body: (await request.json()) as Call["body"],
      });
      if (updateStatus !== 200) return HttpResponse.json({}, { status: updateStatus });
      return HttpResponse.json({ id: params.id, name: "Saved" });
    })
  );
  return calls;
}

function renderWorkspace() {
  return render(
    <TooltipProvider>
      <ScenarioWorkspace variant="calculator" />
    </TooltipProvider>
  );
}

async function run(calls: Call[], count: number) {
  const panel = screen.getByRole("complementary", { name: "Your scenario" });
  await waitFor(() =>
    expect(within(panel).getByRole("button", { name: "Run the numbers" })).toBeEnabled()
  );
  fireEvent.click(within(panel).getByRole("button", { name: "Run the numbers" }));
  await waitFor(() => expect(calls).toHaveLength(count));
}

it("overwrites the saved scenario when the same one is run again", async () => {
  const calls = setUp();
  renderWorkspace();
  await run(calls, 1);
  await run(calls, 2);
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
    "POST /api/scenarios",
    "PUT /api/scenarios/new-1",
  ]);
  expect(calls[0].body.draft?.birth_year).toBe(new Date().getFullYear() - 52);
});

it("saves a new copy when the saved one was deleted elsewhere", async () => {
  const calls = setUp({ updateStatus: 404 });
  sessionStorage.setItem("lucerna:saved-scenario:v1", JSON.stringify("gone"));
  renderWorkspace();
  await run(calls, 2);
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
    "PUT /api/scenarios/gone",
    "POST /api/scenarios",
  ]);
  expect(JSON.parse(sessionStorage.getItem("lucerna:saved-scenario:v1")!)).toBe("new-2");
});

it("starts a new saved copy from New scenario", async () => {
  const calls = setUp();
  sessionStorage.setItem("lucerna:saved-scenario:v1", JSON.stringify("old"));
  window.history.replaceState(null, "", "/calculator?new=1");
  renderWorkspace();
  await waitFor(() => expect(window.location.search).toBe(""));
  expect(sessionStorage.getItem("lucerna:saved-scenario:v1")).toBeNull();
  // The form starts blank.
  const panel = screen.getByRole("complementary", { name: "Your scenario" });
  expect(within(panel).getByRole("button", { name: "Run the numbers" })).toBeDisabled();
  expect(calls).toHaveLength(0);
});

it("keeps working on a saved scenario opened from My scenarios", async () => {
  const calls = setUp();
  server.use(
    http.get(`${API}/api/scenarios/abc`, () =>
      HttpResponse.json({
        id: "abc",
        name: "Saved",
        created_at: "2026-10-13T00:00:00Z",
        updated_at: "2026-10-13T00:00:00Z",
        inputs: sampleOptimizationResult.input,
        result: {},
        draft: { ...DRAFT, birth_year: 1965 },
      })
    )
  );
  window.history.replaceState(null, "", "/calculator?saved=abc");
  renderWorkspace();
  await screen.findByText("Saved scenario");
  expect(calls).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: /back to/i }));
  await run(calls, 1);
  expect(calls[0].method).toBe("PUT");
  expect(calls[0].path).toBe("/api/scenarios/abc");
  expect(calls[0].body.draft?.birth_year).toBe(1965);
});

it("remembers only the latest signed-out run", async () => {
  const calls = setUp();
  auth.signedIn = false;
  renderWorkspace();
  const panel = screen.getByRole("complementary", { name: "Your scenario" });
  for (let i = 0; i < 2; i++) {
    await waitFor(() =>
      expect(within(panel).getByRole("button", { name: "Run the numbers" })).toBeEnabled()
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Run the numbers" }));
    await screen.findAllByTestId("result-headline");
  }
  expect(JSON.parse(sessionStorage.getItem("lucerna:unsaved-runs:v1")!)).toEqual(["r_0000000001"]);
  expect(calls).toHaveLength(0);
});
