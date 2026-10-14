import { render, screen } from "@testing-library/react";
import MyScenariosPage from "../page";

vi.mock("next/navigation", () => ({ usePathname: () => "/my-scenarios" }));

describe("MyScenariosPage", () => {
  it("asks a signed-out visitor to sign in instead of leaving the page", () => {
    render(<MyScenariosPage />);
    expect(screen.getByText("Sign in to see your saved scenarios")).toBeInTheDocument();
    expect(screen.queryByText("No saved scenarios yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete account")).not.toBeInTheDocument();
  });
});
