/**
 * Signed-out stand-in for @clerk/nextjs, aliased in by Vitest and Storybook so
 * components that read the session render without a ClerkProvider or keys.
 */
import type { ReactNode } from "react";

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useUser() {
  return { isLoaded: true, isSignedIn: false, user: null };
}

export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => null,
    signOut: async () => {},
  };
}

export function SignInButton({ children }: { children?: ReactNode; mode?: string }) {
  return <>{children}</>;
}
