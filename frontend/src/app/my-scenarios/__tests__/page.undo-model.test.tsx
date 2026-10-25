/**
 * Bug found by model checking delete with undo (formal/tla/UndoDelete.tla).
 *
 * TLC trace (ServerMatchesIntent): Delete -> PageHide. The pagehide flush sends the
 * DELETE with tokenRef, but tokenRef is only filled when getToken() resolves. If Clerk
 * is refreshing the session token at that moment, the request waits on the network and
 * the page is gone before it is sent: the row comes back next visit.
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

it.fails("sends a pending delete when the page is left during a token refresh", async () => {
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
