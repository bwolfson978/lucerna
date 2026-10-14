import type { Meta, StoryObj } from "@storybook/react";
import { Header } from "./Header";

const meta: Meta<typeof Header> = {
  title: "Common/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {};

/** On the calculator the header drops its "Run your scenario" button. */
export const OnCalculator: Story = {
  parameters: { nextjs: { navigation: { pathname: "/calculator" } } },
};
