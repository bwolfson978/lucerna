import posthog from "posthog-js";

if (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // In production api_host is our own managed reverse proxy (so ad blockers don't drop
    // events); links into PostHog and the toolbar still need the real app host.
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    // Error tracking: report uncaught errors and unhandled rejections as $exception.
    capture_exceptions: true,
  });
}
