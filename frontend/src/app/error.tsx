"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { ErrorNotice } from "@/components/common/ErrorNotice";

/** Route error boundary: reports the render error to PostHog and offers a retry. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error, { digest: error.digest, boundary: "route" });
  }, [error]);

  return <ErrorNotice onRetry={reset} digest={error.digest} />;
}
