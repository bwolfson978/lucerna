"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/lib/auth";
import posthog from "posthog-js";

export function PostHogIdentifier() {
  const { user, isLoaded } = useUser();
  const identifiedId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (user) {
      identifiedId.current = user.id;
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
        created_at: user.createdAt,
      });
    } else if (identifiedId.current) {
      // Only after a sign-out: resetting every signed-out visit would give
      // anonymous visitors a new PostHog id on each page load.
      identifiedId.current = null;
      posthog.reset();
    }
  }, [user, isLoaded]);

  return null;
}
