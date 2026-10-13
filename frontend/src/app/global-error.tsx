"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { ErrorNotice } from "@/components/common/ErrorNotice";
import "./globals.css";

/** Root error boundary: replaces the root layout when it fails, so it renders its own page. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error, { digest: error.digest, boundary: "root" });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorNotice onRetry={reset} />
      </body>
    </html>
  );
}
