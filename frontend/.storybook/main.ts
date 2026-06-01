import path from "path";
import { fileURLToPath } from "url";
import type { StorybookConfig } from "@storybook/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  webpackFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@clerk/nextjs": path.resolve(__dirname, "./__mocks__/clerk.ts"),
    };
    return config;
  },
};

export default config;