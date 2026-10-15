import { render, screen } from "@testing-library/react";
import AccountPage from "../page";

vi.mock("next/navigation", () => ({ usePathname: () => "/account" }));

describe("AccountPage", () => {
  it("asks a signed-out visitor to sign in instead of showing settings", () => {
    render(<AccountPage />);
    expect(screen.getByText("Sign in to manage your account")).toBeInTheDocument();
    expect(screen.queryByText("Delete account")).not.toBeInTheDocument();
  });
});
