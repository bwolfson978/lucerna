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

export interface AccountProfile {
  name: string;
  email: string;
  /** How they sign in, in words: "Google", "Email and password". */
  signIn: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  microsoft: "Microsoft",
};

/** The signed-in person's name, email and sign-in method, or null when signed out. */
export function useAccountProfile(): AccountProfile | null {
  const { user } = useUser();
  if (!user) return null;
  const provider = user.externalAccounts?.[0]?.provider?.replace(/^oauth_/, "");
  return {
    name: user.fullName || user.firstName || "",
    email: user.primaryEmailAddress?.emailAddress ?? "",
    signIn: provider
      ? (PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1))
      : user.passwordEnabled
        ? "Email and password"
        : "Email code",
  };
}

/** Signs the visitor out and returns them to the home page. A no-op without Clerk. */
export const useSignOut: () => () => void = AUTH_ENABLED
  ? () => {
      const { signOut } = useClerk();
      return () => void signOut({ redirectUrl: "/" });
    }
  : () => () => {};

/** Opens Clerk's account modal (name, email, connected sign-ins). A no-op without Clerk. */
export const useOpenUserProfile: () => () => void = AUTH_ENABLED
  ? () => {
      const { openUserProfile } = useClerk();
      return () => openUserProfile();
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
