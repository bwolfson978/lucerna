import type { Preview } from "@storybook/react";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    // Components use App Router hooks (usePathname and friends).
    nextjs: { appDirectory: true },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    // Same provider the root layout wraps the app in.
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default preview;
