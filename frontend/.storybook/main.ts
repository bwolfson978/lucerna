import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
  // Web app components, plus the shared cards from ../ui (their stories live in
  // src/stories/shared so they resolve storybook and react from this package).
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  // Stories render signed out, without a ClerkProvider or Clerk keys.
  webpackFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@clerk/nextjs": fileURLToPath(new URL("../src/test/clerk-mock.tsx", import.meta.url)),
    };
    return config;
  },
};

export default config;
