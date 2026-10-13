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
// write access, is set. Without it the build is unchanged.
module.exports = process.env.POSTHOG_API_KEY
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID || "364668",
      host: "https://us.posthog.com",
      sourcemaps: { releaseName: "lucerna-frontend" },
    })
  : nextConfig;
