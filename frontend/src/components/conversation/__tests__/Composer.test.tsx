import { fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "../Composer";

const SAMPLE = "I'm 55 and single.";

const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement;

describe("Composer sample", () => {
  it("withdraws an untouched sample and offers it again into an empty box", () => {
    const { rerender } = render(<Composer onSend={() => {}} sample={SAMPLE} />);
    expect(box().value).toBe(SAMPLE);

    rerender(<Composer onSend={() => {}} />);
    expect(box().value).toBe("");

    rerender(<Composer onSend={() => {}} sample={SAMPLE} />);
    expect(box().value).toBe(SAMPLE);
    expect(box()).toHaveClass("italic");
  });

  it("keeps what the person typed when the sample goes away", () => {
    const { rerender } = render(<Composer onSend={() => {}} sample={SAMPLE} />);
    fireEvent.change(box(), { target: { value: "I'm 61 and married." } });
    rerender(<Composer onSend={() => {}} />);
    expect(box().value).toBe("I'm 61 and married.");
  });
});
