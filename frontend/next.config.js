const path = require("path");
const { withPostHogConfig } = require("@posthog/nextjs-config");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared display components live in ../ui (also used by the MCP App Views).
  turbopack: {
    root: path.join(__dirname, ".."),
    resolveAlias: { "@lucerna/ui": "../ui/src/index.ts" },
  },
  outputFileTracingRoot: path.join(__dirname, ".."),
};

// Source maps for PostHog error tracking: production builds upload them (then delete
// them from the output) when POSTHOG_API_KEY, a personal API key with error tracking
// write access, is set. Without it the build is unchanged. The deploy workflow builds
// with `vercel pull`, which writes "[SENSITIVE]" in place of a Sensitive variable's
// value, so that placeholder is treated as unset rather than failing the upload.
const posthogApiKey = process.env.POSTHOG_API_KEY;
const uploadSourceMaps = Boolean(posthogApiKey) && posthogApiKey !== "[SENSITIVE]";
if (posthogApiKey && !uploadSourceMaps) {
  console.warn(
    "[next.config] POSTHOG_API_KEY is a Sensitive Vercel variable, which builds can't read; skipping source map upload."
  );
}

module.exports = uploadSourceMaps
  ? withPostHogConfig(nextConfig, {
      personalApiKey: posthogApiKey,
      projectId: process.env.POSTHOG_PROJECT_ID || "364668",
      host: "https://us.posthog.com",
      sourcemaps: { releaseName: "lucerna-frontend" },
    })
  : nextConfig;
