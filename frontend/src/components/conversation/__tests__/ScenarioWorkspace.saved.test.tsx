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

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  auth.signedIn = true;
});

it("re-runs a saved scenario from its link without saving a copy", async () => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/calculator?saved=abc");
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  const saves: unknown[] = [];
  const optimized = vi.fn();
  server.use(
    http.get(`${API}/api/scenarios/abc`, () =>
      HttpResponse.json({
        id: "abc",
        name: "Saved",
        created_at: "2026-10-13T00:00:00Z",
        updated_at: "2026-10-13T00:00:00Z",
        inputs: sampleOptimizationResult.input,
        result: {},
      })
    ),
    http.post(`${API}/api/optimize`, () => {
      optimized();
      return HttpResponse.json(sampleOptimizationResult);
    }),
    http.post(`${API}/api/scenarios`, async ({ request }) => {
      saves.push(await request.json());
      return HttpResponse.json({ id: "new", name: "Copy" });
    })
  );

  render(
    <TooltipProvider>
      <ScenarioWorkspace variant="calculator" />
    </TooltipProvider>
  );

  await waitFor(() => expect(optimized).toHaveBeenCalled());
  await screen.findAllByText(/\$28,500/);
  expect(screen.getByText("Saved scenario")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Saved" })).toBeInTheDocument();
  expect(saves).toHaveLength(0);
  expect(screen.queryByText("Saving your analysis...")).not.toBeInTheDocument();
});

it("saves a run of the scenario to My scenarios", async () => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/calculator");
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.setItem(
    "lucerna:draft:v1",
    JSON.stringify({
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
    })
  );
  const saves: unknown[] = [];
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
    http.post(`${API}/api/scenarios`, async ({ request }) => {
      saves.push(await request.json());
      return HttpResponse.json({ id: "new", name: "Copy" });
    })
  );

  render(
    <TooltipProvider>
      <ScenarioWorkspace variant="calculator" />
    </TooltipProvider>
  );

  const panel = screen.getByRole("complementary", { name: "Your scenario" });
  await waitFor(() => expect(within(panel).getByText("Ready to run")).toBeInTheDocument());
  fireEvent.click(within(panel).getByRole("button", { name: "Run the numbers" }));
  const headline = await screen.findByTestId("result-headline");
  await waitFor(() => expect(saves).toHaveLength(1));
  fireEvent.click(within(headline).getByRole("button", { name: "See full results" }));
  expect(await screen.findByText("Analysis saved")).toBeInTheDocument();
});

it("saves a signed-out run once the visitor signs in", async () => {
  auth.signedIn = false;
  sessionStorage.clear();
  window.history.replaceState(null, "", "/calculator");
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.setItem(
    "lucerna:draft:v1",
    JSON.stringify({
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
    })
  );
  const saves: unknown[] = [];
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
    http.post(`${API}/api/scenarios`, async ({ request }) => {
      saves.push(await request.json());
      return HttpResponse.json({ id: "new", name: "Copy" });
    })
  );

  const { rerender } = render(
    <TooltipProvider>
      <ScenarioWorkspace variant="calculator" />
    </TooltipProvider>
  );

  const panel = screen.getByRole("complementary", { name: "Your scenario" });
  await waitFor(() => expect(within(panel).getByText("Ready to run")).toBeInTheDocument());
  fireEvent.click(within(panel).getByRole("button", { name: "Run the numbers" }));
  const headline = await screen.findByTestId("result-headline");
  fireEvent.click(within(headline).getByRole("button", { name: "See full results" }));
  expect(
    await screen.findByRole("button", { name: "Save with a free account" })
  ).toBeInTheDocument();
  expect(saves).toHaveLength(0);

  auth.signedIn = true;
  rerender(
    <TooltipProvider>
      <ScenarioWorkspace variant="calculator" />
    </TooltipProvider>
  );
  await waitFor(() => expect(saves).toHaveLength(1));
  expect(await screen.findByText("Analysis saved")).toBeInTheDocument();
  expect(JSON.parse(sessionStorage.getItem("lucerna:unsaved-runs:v1") ?? "[]")).toEqual([]);
});
