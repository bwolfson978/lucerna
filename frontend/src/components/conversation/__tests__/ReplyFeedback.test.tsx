import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReplyRating } from "@/lib/agent/types";
import { ReplyFeedback } from "../ReplyFeedback";

function setup(initial?: ReplyRating) {
  const onRate = vi.fn();
  function Harness() {
    const [rating, setRating] = useState(initial);
    return (
      <ReplyFeedback
        rating={rating}
        onRate={(next) => {
          onRate(next);
          setRating(next ?? undefined);
        }}
      />
    );
  }
  render(<Harness />);
  return onRate;
}

describe("ReplyFeedback", () => {
  it("saves a thumbs down on the tap, before the form is touched", async () => {
    const onRate = setup();
    await userEvent.click(screen.getByRole("button", { name: "Bad reply" }));
    expect(onRate).toHaveBeenCalledWith({ value: "down" });
    expect(screen.getByRole("button", { name: "Bad reply" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("dialog", { name: "What went wrong?" })).toBeInTheDocument();
  });

  it("sends the reason and note from the form", async () => {
    const onRate = setup();
    await userEvent.click(screen.getByRole("button", { name: "Bad reply" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Hard to follow" }));
    await userEvent.type(within(dialog).getByLabelText("Details"), "  Too much jargon ");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Send/ }));
    expect(onRate).toHaveBeenLastCalledWith({
      value: "down",
      reason: "hard_to_follow",
      note: "Too much jargon",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Thanks for the feedback.");
  });

  it("keeps the rating when the form is closed without sending", async () => {
    const onRate = setup();
    await userEvent.click(screen.getByRole("button", { name: "Bad reply" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Bad reply" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("asks a thumbs up for details only", async () => {
    const onRate = setup();
    await userEvent.click(screen.getByRole("button", { name: "Good reply" }));
    expect(onRate).toHaveBeenCalledWith({ value: "up" });
    const dialog = screen.getByRole("dialog", { name: "What worked well?" });
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
  });

  it("clears the rating when the picked thumb is tapped again", async () => {
    const onRate = setup({ value: "up" });
    await userEvent.click(screen.getByRole("button", { name: "Good reply" }));
    expect(onRate).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("switches from up to down and drops nothing the person didn't say", async () => {
    const onRate = setup({ value: "up", note: "Clear" });
    await userEvent.click(screen.getByRole("button", { name: "Bad reply" }));
    expect(onRate).toHaveBeenCalledWith({ value: "down" });
  });
});
