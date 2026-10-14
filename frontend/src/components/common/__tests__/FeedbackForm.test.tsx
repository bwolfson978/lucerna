import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedbackForm } from "../FeedbackForm";
import { problemReportHref } from "../ErrorNotice";

describe("FeedbackForm", () => {
  it("sends a problem report and thanks the user", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<FeedbackForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("radio", { name: "Report a problem" }));
    await userEvent.type(screen.getByLabelText("What went wrong?"), "  Chart is blank ");
    await userEvent.type(screen.getByLabelText(/What did you expect/), "A chart");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "problem",
      message: "Chart is blank",
      expected: "A chart",
      email: undefined,
    });
    expect(await screen.findByText(/it's been sent/)).toBeInTheDocument();
  });

  it("asks for a message before sending", async () => {
    const onSubmit = vi.fn();
    render(<FeedbackForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please write a few words first.");
  });

  it("shows why a send failed", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Too many messages today."));
    render(<FeedbackForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("What's on your mind?"), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many messages today.");
  });
});

describe("problemReportHref", () => {
  it("carries the error digest and the page", () => {
    expect(problemReportHref("abc", "/calculator")).toBe(
      "/feedback?kind=problem&digest=abc&from=%2Fcalculator"
    );
    expect(problemReportHref()).toBe("/feedback?kind=problem");
  });
});
