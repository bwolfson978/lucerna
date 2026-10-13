"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { AccountContext, type Account } from "@/lib/auth/account";
import { setTokenGetter } from "@/lib/auth/token";

/** Turns Clerk's state into the app's `Account` context, hands API clients the session
 * token, and links PostHog events to the signed-in person. */
export function ClerkAccountBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const clerk = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const name = user?.fullName ?? null;
  const wasSignedIn = useRef(false);

  useEffect(() => {
    setTokenGetter(isSignedIn ? () => getToken() : null);
    return () => setTokenGetter(null);
  }, [isSignedIn, getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && userId) {
      // The Clerk user id is the PostHog person, so anonymous events from this device join
      // their history. Email and name are person properties, to find someone in PostHog.
      posthog.identify(userId, {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      });
      wasSignedIn.current = true;
    } else if (wasSignedIn.current) {
      posthog.reset();
      wasSignedIn.current = false;
    }
  }, [isLoaded, isSignedIn, userId, email, name]);

  const value: Account = useMemo(
    () => ({
      enabled: true,
      loaded: isLoaded,
      signedIn: Boolean(isSignedIn),
      userId: userId ?? null,
      openSignIn: () => clerk.openSignIn({ forceRedirectUrl: window.location.href }),
    }),
    [isLoaded, isSignedIn, userId, clerk]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
