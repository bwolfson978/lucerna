import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyScenariosPage from "../page";
import { SAMPLE_SCENARIOS } from "@/components/scenarios/fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/my-scenarios" }));

const api = {
  list: vi.fn(),
  delete: vi.fn(),
  deleteAccountData: vi.fn(),
};
vi.mock("@/lib/api/scenarios", () => ({ createScenariosApi: () => api }));
// Clerk's getToken is stable across renders; a new one each render would refetch the list.
const auth = { getToken: async () => "token" };
vi.mock("@/lib/auth", () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: null }),
  useAuth: () => auth,
  useDeleteClerkUser: () => async () => {},
  useSignOut: () => () => {},
  SignInButton: () => null,
  AUTH_ENABLED: true,
}));

async function deleteBaseline(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Baseline: no conversions");
  await user.click(screen.getByRole("button", { name: "Delete Baseline: no conversions" }));
  await user.click(screen.getByRole("button", { name: "Delete scenario" }));
}

describe("MyScenariosPage signed in", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.list.mockResolvedValue(SAMPLE_SCENARIOS);
    api.delete.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("hides a deleted scenario at once and sends the delete after the undo window", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MyScenariosPage />);
    await deleteBaseline(user);

    expect(screen.queryByText("Baseline: no conversions")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Deleted “Baseline: no conversions”");
    expect(api.delete).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(api.delete).toHaveBeenCalledWith("s4", undefined);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("brings the scenario back on Undo without sending anything", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MyScenariosPage />);
    await deleteBaseline(user);

    await user.click(within(screen.getByRole("status")).getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Baseline: no conversions")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("sends a pending delete when the page is left", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<MyScenariosPage />);
    await deleteBaseline(user);
    unmount();
    expect(api.delete).toHaveBeenCalledWith("s4", { keepalive: true });
  });

  it("shows the empty state once every scenario is gone", async () => {
    api.list.mockResolvedValue(SAMPLE_SCENARIOS.slice(3, 4));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MyScenariosPage />);
    await deleteBaseline(user);
    expect(screen.getByText("No saved scenarios yet")).toBeInTheDocument();
    expect(screen.getByText("0 saved scenarios will be deleted with it.")).toBeInTheDocument();
  });
});
