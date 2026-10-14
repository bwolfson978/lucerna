import { fireEvent, render, screen } from "@testing-library/react";
import { Header } from "../Header";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("Header", () => {
  it("offers sign out to a signed-in visitor, on desktop and in the phone menu", () => {
    render(<Header isSignedIn />);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(2);
  });

  it("has no sign out for a signed-out visitor", () => {
    render(<Header />);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });
});
