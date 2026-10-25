/**
 * Bugs found by model checking auto-save (formal/tla/AutoSave.tla). Each `it.fails`
 * replays one TLC counterexample; when a fix lands it starts failing, and becomes `it`.
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
vi.mock("@/lib/auth", () => ({
  AUTH_ENABLED: true,
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: null }),
  useAuth: () => ({ getToken: async () => "token" }),
  useSignOut: () => () => {},
  useAccountProfile: () => ({ name: "Barry", email: "you@example.com", signIn: "Google" }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

const API = "http://localhost:8000";
const ID = "r_0000000001";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/calculator");
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
});

function renderWorkspace() {
  return render(
    <TooltipProvider>
      <ScenarioWorkspace variant="calculator" />
    </TooltipProvider>
  );
}

// TLC trace (NoSilentLossWhenSavesSucceed): Run signed out -> StorageFull -> SignInReload
// -> SaveQueued. The run was too big for session storage, so it came back from the Google
// sign-in reload with `result: null`; it is recomputed from its input and then saved.
it("saves a run made before sign-in even when its result was too big to keep", async () => {
  sessionStorage.setItem(
    "lucerna:conversation:v1",
    JSON.stringify({
      messages: [],
      apiMessages: [],
      results: {
        [ID]: { label: "Your scenario", input: sampleOptimizationResult.input, result: null },
      },
    })
  );
  sessionStorage.setItem("lucerna:unsaved-runs:v1", JSON.stringify([ID]));
  const saves: unknown[] = [];
  server.use(
    http.post(`${API}/api/optimize`, () => HttpResponse.json(sampleOptimizationResult)),
    http.post(`${API}/api/scenarios`, async ({ request }) => {
      saves.push(await request.json());
      return HttpResponse.json({ id: "new", name: "Saved" });
    })
  );

  renderWorkspace();

  await waitFor(() => expect(saves).toHaveLength(1), { timeout: 2000 });
});

// TLC trace (NoSilentLossWhenStorageFits): SignIn -> Run -> SaveFails. The banner used to
// go back to "prompt", which is only shown to signed-out visitors, so nothing said the run
// was not saved. It now shows "failed" with Try again.
it("tells a signed-in person when saving their run failed", async () => {
  sessionStorage.setItem(
    "lucerna:draft:v1",
    JSON.stringify({
      ...EMPTY_DRAFT,
      age: 52,
      filing_status: "married_filing_jointly",
      current_income: 90000,
      traditional_balance: 600000,
      retirement_age: 60,
      timeline: [{ year: 2026, gross_income: 90000 }],
    })
  );
  const events: AgentEvent[] = [
    { type: "result", result_id: ID, label: "Your scenario", result: sampleOptimizationResult },
    { type: "part", part: { kind: "result_headline", result_id: ID } },
    { type: "done", messages: [{ role: "user", content: "run" }] },
  ];
  let attempts = 0;
  server.use(
    http.post(
      `${API}/api/agent`,
      () =>
        new HttpResponse(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
          headers: { "Content-Type": "text/event-stream" },
        })
    ),
    http.post(`${API}/api/scenarios`, () => {
      attempts += 1;
      return HttpResponse.json({ detail: "Database not available" }, { status: 503 });
    })
  );

  renderWorkspace();

  const panel = screen.getByRole("complementary", { name: "Your scenario" });
  await waitFor(() => expect(within(panel).getByText("Ready to run")).toBeInTheDocument());
  fireEvent.click(within(panel).getByRole("button", { name: "Run the numbers" }));
  const headline = await screen.findByTestId("result-headline");
  await waitFor(() => expect(attempts).toBe(1));
  fireEvent.click(within(headline).getByRole("button", { name: "See full results" }));
  const alert = await screen.findByRole("alert", {}, { timeout: 2000 });
  expect(within(alert).getByText("Couldn't save this analysis")).toBeInTheDocument();

  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(attempts).toBe(2));
});
