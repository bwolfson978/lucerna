import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import { ClerkAccountBridge } from "../ClerkAccountBridge";

vi.mock("posthog-js", () => ({ default: { identify: vi.fn(), reset: vi.fn() } }));

const clerk = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: "user_1", getToken: async () => "tok" },
  user: {
    primaryEmailAddress: { emailAddress: "pat@example.com" },
    fullName: "Pat Doe",
  } as unknown,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => clerk.auth,
  useClerk: () => ({ openSignIn: vi.fn() }),
  useUser: () => ({ user: clerk.user }),
}));

describe("ClerkAccountBridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("identifies the PostHog person by Clerk id, with email and name", () => {
    render(<ClerkAccountBridge>child</ClerkAccountBridge>);
    expect(posthog.identify).toHaveBeenCalledWith("user_1", {
      email: "pat@example.com",
      name: "Pat Doe",
    });
  });

  it("resets PostHog on sign-out", () => {
    const { rerender } = render(<ClerkAccountBridge>child</ClerkAccountBridge>);
    clerk.auth = { ...clerk.auth, isSignedIn: false, userId: null as unknown as string };
    clerk.user = null;
    rerender(<ClerkAccountBridge>child</ClerkAccountBridge>);
    expect(posthog.reset).toHaveBeenCalledTimes(1);
  });
});
