"use client";

import posthog from "posthog-js";
import { FeedbackForm, type FeedbackKind } from "@/components/common/FeedbackForm";
import { apiClient } from "@/lib/api/client";

/** The feedback form, sent with the page and PostHog ids so a report links to its replay. */
export function FeedbackPageForm({
  initialKind,
  errorDigest,
  fromPath,
}: {
  initialKind: FeedbackKind;
  errorDigest?: string;
  /** The page a "Report this problem" link came from. */
  fromPath?: string;
}) {
  return (
    <FeedbackForm
      initialKind={initialKind}
      onSubmit={async (submission) => {
        await apiClient.submitFeedback({
          ...submission,
          page_url: fromPath?.startsWith("/") ? fromPath : undefined,
          error_digest: errorDigest,
          distinct_id: posthog.__loaded ? posthog.get_distinct_id() : undefined,
          session_id: posthog.__loaded ? posthog.get_session_id() : undefined,
        });
      }}
    />
  );
}
