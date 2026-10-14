import type { Meta, StoryObj } from "@storybook/react";
import { FeedbackForm } from "./FeedbackForm";

const meta: Meta<typeof FeedbackForm> = {
  title: "Common/FeedbackForm",
  component: FeedbackForm,
  args: { onSubmit: async () => {} },
  decorators: [
    (Story) => (
      <div className="max-w-[640px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FeedbackForm>;

export const Feedback: Story = {};

export const ReportAProblem: Story = { args: { initialKind: "problem" } };

export const SendFails: Story = {
  args: {
    onSubmit: async () => {
      throw new Error("Too many messages today. Please try again tomorrow.");
    },
  },
};
