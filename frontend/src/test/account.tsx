import type { ReactNode } from "react";
import { vi } from "vitest";
import { AccountContext, type Account } from "@/lib/auth/account";

/** An account state for tests, signed in by default. */
export function testAccount(overrides: Partial<Account> = {}): Account {
  return {
    enabled: true,
    loaded: true,
    signedIn: true,
    userId: "user_test",
    openSignIn: vi.fn(),
    ...overrides,
  };
}

export function withAccount(account: Account) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
  };
}
