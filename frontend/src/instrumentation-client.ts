import posthog from "posthog-js";

if (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2026-01-30",
  });
  // Where the person is using the product. The backend tags its events with the other
  // channels (web_assistant, claude, chatgpt, mcp_other); see backend app/mcp/analytics.py.
  posthog.register({ channel: "web" });
}
