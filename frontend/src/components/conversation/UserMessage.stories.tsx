import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { UserMessage } from "./UserMessage";

const TEXT =
  "I was born in March 1971 and I'm single, with $95,000 of income this year. I have $650,000 in a traditional 401(k) and plan to start drawing on it at 62.";

function Stateful(props: { editable?: boolean; startEditing?: boolean; busy?: boolean }) {
  const [text, setText] = useState(TEXT);
  const [editing, setEditing] = useState(props.startEditing ?? false);
  return (
    <div className="max-w-[720px]">
      <UserMessage
        text={text}
        busy={props.busy}
        onEdit={props.editable === false ? undefined : setText}
        editing={editing}
        onEditingChange={setEditing}
      />
    </div>
  );
}

const meta: Meta<typeof Stateful> = {
  title: "Conversation/UserMessage",
  component: Stateful,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Stateful>;

/** Copy and Edit show on hover (always on touch screens). */
export const Default: Story = {};

/** Editing: Send reruns the conversation from this message, Cancel or Escape puts it back. */
export const Editing: Story = { args: { startEditing: true } };

/** A replayed example message: Copy only. */
export const CopyOnly: Story = { args: { editable: false } };

/** While a reply is arriving, Edit waits. */
export const WhileReplying: Story = { args: { busy: true } };
