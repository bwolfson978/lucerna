import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "../AccountSettings";
import { AccountDeleted } from "../AccountDeleted";

const profile = { name: "Barry", email: "you@example.com", signIn: "Google" };

describe("AccountSettings", () => {
  it("shows the profile, what's saved, and the delete card", () => {
    render(
      <AccountSettings
        profile={profile}
        data={{ count: 8, lastSaved: "2026-10-14T18:00:00Z" }}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Account settings", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("you@example.com")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText(/8 scenarios/)).toBeInTheDocument();
    expect(screen.getByText("Oct 14, 2026")).toBeInTheDocument();
    expect(screen.getByText(/all 8 saved scenarios/)).toBeInTheDocument();
  });

  it("downloads only when there's something saved", async () => {
    const onDownload = vi.fn();
    const { rerender } = render(
      <AccountSettings
        profile={profile}
        data={{ count: 0, lastSaved: null }}
        onDownload={onDownload}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Download scenarios" })).toBeDisabled();

    rerender(
      <AccountSettings
        profile={profile}
        data={{ count: 2, lastSaved: "2026-10-14T18:00:00Z" }}
        onDownload={onDownload}
        onDelete={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Download scenarios" }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});

describe("AccountDeleted", () => {
  it("confirms what was deleted and points to the chat apps", () => {
    render(<AccountDeleted scenarioCount={8} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your account is gone.");
    expect(screen.getByText(/your account and all 8 saved scenarios/)).toBeInTheDocument();
    expect(screen.getByText(/connector settings/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
