"use client";

/**
 * Clerk is optional: without NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (local dev, tests,
 * e2e, Storybook) there is no ClerkProvider and these hooks report a signed-out
 * visitor, so the app runs with sign-in hidden. The key is inlined at build time,
 * so each build always calls the same hooks.
 */

import type { ReactNode } from "react";
import {
  SignInButton as ClerkSignInButton,
  useAuth as useClerkAuth,
  useClerk,
  useUser as useClerkUser,
} from "@clerk/nextjs";

export const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const signedOutUser = { isLoaded: true, isSignedIn: false, user: null } as const;
const signedOutAuth = { getToken: async () => null } as const;

export const useUser: () => Pick<
  ReturnType<typeof useClerkUser>,
  "isLoaded" | "isSignedIn" | "user"
> = AUTH_ENABLED ? useClerkUser : () => signedOutUser;

export const useAuth: () => Pick<ReturnType<typeof useClerkAuth>, "getToken"> = AUTH_ENABLED
  ? useClerkAuth
  : () => signedOutAuth;

/** Signs the visitor out and returns them to the home page. A no-op without Clerk. */
export const useSignOut: () => () => void = AUTH_ENABLED
  ? () => {
      const { signOut } = useClerk();
      return () => void signOut({ redirectUrl: "/" });
    }
  : () => () => {};

/**
 * Deletes the signed-in Clerk user (which also signs them out). Throws if Clerk refuses,
 * for example when self-deletion is turned off for the instance. A no-op without Clerk.
 */
export const useDeleteClerkUser: () => () => Promise<void> = AUTH_ENABLED
  ? () => {
      const { user } = useClerkUser();
      return async () => {
        if (!user) throw new Error("Not signed in");
        await user.delete();
      };
    }
  : () => async () => {};

export function SignInButton({ children }: { children: ReactNode }) {
  if (!AUTH_ENABLED) return null;
  return <ClerkSignInButton mode="modal">{children}</ClerkSignInButton>;
}
