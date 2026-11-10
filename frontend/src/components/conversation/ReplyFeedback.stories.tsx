import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReplyRating } from "@/lib/agent/types";
import { ReplyFeedback } from "./ReplyFeedback";

function Stateful(props: { initial?: ReplyRating; open?: boolean }) {
  const [rating, setRating] = useState<ReplyRating | undefined>(props.initial);
  return (
    <div className="flex max-w-[680px] flex-col gap-1.5 p-4">
      <p className="text-[16px] leading-relaxed text-ink-soft">
        Based on your inputs, spreading conversions over the years before Social Security starts
        keeps each year inside the 12% bracket.
      </p>
      <ReplyFeedback
        rating={rating}
        onRate={(next) => setRating(next ?? undefined)}
        defaultOpen={props.open}
      />
    </div>
  );
}

const meta: Meta<typeof Stateful> = {
  title: "Conversation/ReplyFeedback",
  component: Stateful,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Stateful>;

/** Under every finished reply. Tap a thumb to rate; tap it again to clear. */
export const Resting: Story = {};

export const ThumbsUp: Story = { args: { initial: { value: "up" } } };

export const ThumbsDown: Story = {
  args: { initial: { value: "down", reason: "hard_to_follow" } },
};

/** A dialog on larger screens: a dropdown for the reason, then details. */
export const DownDialog: Story = {
  args: { initial: { value: "down" }, open: true },
};

/** Thumbs up asks one optional question. */
export const UpDialog: Story = {
  args: { initial: { value: "up" }, open: true },
};

/** On phones the form is a sheet from the bottom with reasons to tap. */
export const DownSheetOnPhone: Story = {
  args: { initial: { value: "down", reason: "numbers_look_wrong" }, open: true },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
