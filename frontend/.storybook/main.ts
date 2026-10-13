import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
  // Web app components, plus the shared cards from ../ui (their stories live in
  // src/stories/shared so they resolve storybook and react from this package).
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
};

export default config;
