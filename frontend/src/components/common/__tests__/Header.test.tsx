import { fireEvent, render, screen, within } from "@testing-library/react";
import { Header } from "../Header";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("Header", () => {
  it("puts account settings and sign out in the account menu and the phone menu", () => {
    render(<Header isSignedIn account={{ name: "Barry", email: "you@example.com" }} />);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();

    // One avatar in the desktop nav, one in the phone bar; CSS shows one at a time.
    const avatar = screen.getAllByRole("button", { name: "Account menu" })[0];
    expect(avatar).toHaveTextContent("B");
    fireEvent.click(avatar);
    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("you@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute(
      "href",
      "/account"
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(avatar).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
    expect(screen.getByRole("link", { name: "Account settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("lists Claude & ChatGPT first, on desktop and in the phone menu", () => {
    render(<Header />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getAllByRole("link")[0]).toHaveAttribute("href", "/connect");
    fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
    const menu = screen.getByRole("navigation", { name: "Mobile" });
    expect(within(menu).getAllByRole("link")[0]).toHaveTextContent("Claude & ChatGPT");
  });

  it("keeps My scenarios in the account menu, not the main nav", () => {
    render(<Header isSignedIn account={{ name: "Barry", email: "you@example.com" }} />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).queryByRole("link", { name: "My scenarios" })).not.toBeInTheDocument();
  });

  it("offers sign in to a signed-out visitor, and creating an account in the phone menu", () => {
    render(<Header isSignedIn={false} />);
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
    const menu = screen.getByRole("navigation", { name: "Mobile" });
    expect(within(menu).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("has no sign out for a signed-out visitor", () => {
    render(<Header />);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });
});
