/**
 * Bug found by model checking delete with undo (formal/tla/UndoDelete.tla).
 *
 * TLC trace (ServerMatchesIntent): Delete -> PageHide. The pagehide flush used a token
 * fetched when the delete started. If Clerk was refreshing the session token at that
 * moment, the request waited on the network and the page was gone before it was sent:
 * the row came back next visit. The page now keeps the token from the list load fresh,
 * so the flush never waits.
 *
 * A browser runs microtasks after the pagehide handler but no further network or timer
 * work, so the test lets microtasks run and nothing else.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyScenariosPage from "../page";
import { SAMPLE_SCENARIOS } from "@/components/scenarios/fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/my-scenarios" }));

const tokens = { refreshing: false };
beforeEach(() => {
  tokens.refreshing = false;
});
const auth = {
  // Stable across renders, like Clerk's. While refreshing, the token waits on the network.
  getToken: () => (tokens.refreshing ? new Promise<string>(() => {}) : Promise.resolve("token")),
};
vi.mock("@/lib/auth", () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: null }),
  useAuth: () => auth,
  useSignOut: () => () => {},
  useAccountProfile: () => ({ name: "Barry", email: "you@example.com", signIn: "Google" }),
  SignInButton: () => null,
  AUTH_ENABLED: true,
}));

it("sends a pending delete when the page is left during a token refresh", async () => {
  const deletes: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (init?.method === "DELETE") deletes.push(String(url));
    const body = init?.method === "DELETE" ? null : JSON.stringify(SAMPLE_SCENARIOS);
    return new Response(body, { status: init?.method === "DELETE" ? 204 : 200 });
  });
  const user = userEvent.setup();
  render(<MyScenariosPage />);
  await screen.findByText("Baseline: no conversions");

  tokens.refreshing = true;
  await user.click(screen.getByRole("button", { name: "Delete Baseline: no conversions" }));
  await user.click(screen.getByRole("button", { name: "Delete scenario" }));
  window.dispatchEvent(new Event("pagehide"));
  for (let i = 0; i < 10; i++) await Promise.resolve();

  expect(deletes).toEqual([expect.stringContaining("/api/scenarios/s4")]);
});

it("sends an earlier delete still waiting on its token when the page is left", async () => {
  const deletes: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (init?.method === "DELETE") deletes.push(String(url));
    const body = init?.method === "DELETE" ? null : JSON.stringify(SAMPLE_SCENARIOS);
    return new Response(body, { status: init?.method === "DELETE" ? 204 : 200 });
  });
  const user = userEvent.setup();
  render(<MyScenariosPage />);
  await screen.findByText("Baseline: no conversions");

  tokens.refreshing = true;
  // The second delete commits the first, whose request then waits on the refresh.
  await user.click(screen.getByRole("button", { name: "Delete Baseline: no conversions" }));
  await user.click(screen.getByRole("button", { name: "Delete scenario" }));
  const [other] = screen.getAllByRole("button", { name: /^Delete (?!Baseline)/ });
  await user.click(other);
  await user.click(screen.getByRole("button", { name: "Delete scenario" }));
  window.dispatchEvent(new Event("pagehide"));
  for (let i = 0; i < 10; i++) await Promise.resolve();

  expect(deletes).toHaveLength(2);
  expect(deletes).toContainEqual(expect.stringContaining("/api/scenarios/s4"));
});
