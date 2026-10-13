import posthog from "posthog-js";

/**
 * The browser's PostHog ids, sent to the backend so its events (the assistant's tool
 * calls, see backend app/mcp/analytics.py) join this visitor's timeline and session
 * replay. Same header names as posthog-js tracing headers. Empty when analytics are off.
 */
export function analyticsHeaders(): Record<string, string> {
  try {
    if (!posthog.__loaded) return {};
    const headers: Record<string, string> = {};
    const distinctId = posthog.get_distinct_id();
    const sessionId = posthog.get_session_id();
    if (distinctId) headers["X-POSTHOG-DISTINCT-ID"] = distinctId;
    if (sessionId) headers["X-POSTHOG-SESSION-ID"] = sessionId;
    return headers;
  } catch {
    return {};
  }
}
