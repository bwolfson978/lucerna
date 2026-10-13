"use client";

/**
 * The visitor's account, as the rest of the app sees it. Components read this context
 * instead of Clerk's hooks, so they render (signed out) when accounts aren't configured
 * and tests can provide any state without Clerk.
 */

import { createContext, useContext } from "react";

export interface Account {
  /** Accounts are configured (a Clerk publishable key is set). */
  enabled: boolean;
  /** Clerk has finished loading; `signedIn` is final. */
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  /** Open the sign-in modal. Returns to this page afterwards. */
  openSignIn: () => void;
}

export const SIGNED_OUT: Account = {
  enabled: false,
  loaded: true,
  signedIn: false,
  userId: null,
  openSignIn: () => {},
};

export const AccountContext = createContext<Account>(SIGNED_OUT);

export function useAccount(): Account {
  return useContext(AccountContext);
}
