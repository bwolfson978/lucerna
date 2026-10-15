import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { sampleOptimizationResult } from "@/test/fixtures/optimization-result";
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

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
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
  expect(saves).toHaveLength(0);
  expect(screen.queryByText("Saving your analysis...")).not.toBeInTheDocument();
});
