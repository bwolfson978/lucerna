import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/test/mocks/server";
import { testAccount } from "@/test/account";
import { AccountContext, type Account } from "@/lib/auth/account";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MethodologyProvider } from "@/components/methodology/MethodologyContext";
import { SavedScenariosPage } from "../SavedScenariosPage";

vi.mock("next/navigation", () => ({ usePathname: () => "/scenarios" }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-testid="user-button" /> }));

const API = "http://localhost:8000/api/saved-scenarios";

const PLAN = {
  scenario_id: "abc",
  name: "Plan A",
  saved_at: "2026-10-13T12:00:00Z",
  age: 52,
  filing_status: "married_filing_jointly",
  traditional_balance: 600000,
  retirement_age: 60,
  state: null,
  complete: true,
};

function renderPage(account: Account = testAccount()) {
  return render(
    <AccountContext.Provider value={account}>
      <MethodologyProvider askAbout={() => {}}>
        <TooltipProvider>
          <SavedScenariosPage />
        </TooltipProvider>
      </MethodologyProvider>
    </AccountContext.Provider>
  );
}

describe("SavedScenariosPage", () => {
  it("lists saved scenarios with a link to open each", async () => {
    server.use(http.get(API, () => HttpResponse.json({ saved_scenarios: [PLAN] })));
    renderPage();
    const row = (await screen.findByRole("heading", { name: "Plan A" })).closest("li")!;
    expect(
      within(row).getByText(/Age 52 · Married · \$600K pre-tax · retire at 60/)
    ).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/calculator?saved=abc"
    );
  });

  it("renames and deletes", async () => {
    server.use(
      http.get(API, () => HttpResponse.json({ saved_scenarios: [PLAN] })),
      http.patch(`${API}/abc`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ ...PLAN, name: body.name });
      }),
      http.delete(`${API}/abc`, () => new HttpResponse(null, { status: 204 }))
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Scenario name"), { target: { value: "Plan B" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByRole("heading", { name: "Plan B" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Plan B" })).toBeNull());
    expect(screen.getByText(/No saved scenarios yet/)).toBeInTheDocument();
  });

  it("asks signed-out visitors to sign in", () => {
    const account = testAccount({ signedIn: false, userId: null });
    renderPage(account);
    const main = screen.getByRole("main");
    fireEvent.click(within(main).getByRole("button", { name: "Sign in" }));
    expect(account.openSignIn).toHaveBeenCalled();
  });

  it("says when saving isn't available", () => {
    renderPage(testAccount({ enabled: false, signedIn: false }));
    expect(screen.getByText(/isn't available right now/)).toBeInTheDocument();
  });

  it("offers a retry when the list fails to load", async () => {
    server.use(http.get(API, () => HttpResponse.json({}, { status: 503 })));
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    server.use(http.get(API, () => HttpResponse.json({ saved_scenarios: [PLAN] })));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Plan A" })).toBeInTheDocument();
  });
});
