import type { Meta, StoryObj } from "@storybook/react";
import { PageFooter } from "./PageFooter";

const meta: Meta<typeof PageFooter> = {
  title: "Common/PageFooter",
  component: PageFooter,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof PageFooter>;

/** Site links, the educational disclaimer, then Privacy, Terms and Support. */
export const Default: Story = {};
