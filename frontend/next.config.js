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

const withPostHog = uploadSourceMaps
  ? withPostHogConfig(nextConfig, {
      personalApiKey: posthogApiKey,
      projectId: process.env.POSTHOG_PROJECT_ID || "364668",
      host: "https://us.posthog.com",
      // symbol-set mode injects chunk ids into the built files itself; event mode relies on
      // Turbopack debug ids, which edge chunks (Clerk middleware) lack, failing the upload.
      sourcemaps: { releaseName: "lucerna-frontend", releaseMode: "symbol-set" },
    })
  : null;

// A failed upload (PostHog or its storage unreachable) should not block a deploy: the
// app works without source maps, only its stack traces are minified.
module.exports = withPostHog
  ? async (phase, options) => {
      const config = await withPostHog(phase, options);
      const upload = config.compiler?.runAfterProductionCompile;
      if (upload) {
        config.compiler.runAfterProductionCompile = async (context) => {
          try {
            await upload(context);
          } catch (error) {
            console.warn("[next.config] PostHog source map upload failed; continuing.", error);
          }
        };
      }
      return config;
    }
  : nextConfig;
