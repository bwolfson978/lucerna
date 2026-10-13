import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { testAccount, withAccount } from "@/test/account";
import { AccountNav, MobileAccountNav } from "../AccountNav";

vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-testid="user-button" /> }));

describe("AccountNav", () => {
  it("shows nothing without accounts or before Clerk loads", () => {
    for (const account of [testAccount({ enabled: false }), testAccount({ loaded: false })]) {
      const { container, unmount } = render(<AccountNav active={false} />, {
        wrapper: withAccount(account),
      });
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("offers sign-in when signed out", () => {
    const account = testAccount({ signedIn: false });
    render(<AccountNav active={false} />, { wrapper: withAccount(account) });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(account.openSignIn).toHaveBeenCalled();
  });

  it("links to saved scenarios and the account menu when signed in", () => {
    render(<AccountNav active />, { wrapper: withAccount(testAccount()) });
    expect(screen.getByRole("link", { name: "My scenarios" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
  });

  it("closes the mobile menu before opening sign-in", () => {
    const account = testAccount({ signedIn: false });
    const onClose = vi.fn();
    render(<MobileAccountNav onLinkClick={vi.fn()} onClose={onClose} />, {
      wrapper: withAccount(account),
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onClose).toHaveBeenCalled();
    expect(account.openSignIn).toHaveBeenCalled();
  });
});
