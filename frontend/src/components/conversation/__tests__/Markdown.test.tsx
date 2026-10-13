import { render } from "@testing-library/react";
import { Markdown } from "../Markdown";

function html(text: string) {
  return render(<Markdown text={text} />).container;
}

describe("Markdown", () => {
  it("renders a lead-in sentence and the list beneath it as a paragraph and a list", () => {
    const el = html(
      "**The schedule.** It converts in all ten years.\n- 2026: $183,800.\n- 2027: $122,500."
    );
    expect(el.querySelector("p")?.textContent).toBe("The schedule. It converts in all ten years.");
    const items = [...el.querySelectorAll("ul li")].map((li) => li.textContent);
    expect(items).toEqual(["2026: $183,800.", "2027: $122,500."]);
    expect(el.textContent).not.toContain("- ");
  });

  it("returns to a paragraph after a list in the same block", () => {
    const el = html("Steps:\n1. Convert.\n2. Pay the tax.\nThat is the plan.");
    expect(el.querySelectorAll("p")).toHaveLength(2);
    expect(el.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("joins an indented continuation line to its list item", () => {
    const el = html("- The analysis is federal only\n  and assumes no ACA coverage.");
    expect(el.querySelector("li")?.textContent).toBe(
      "The analysis is federal only and assumes no ACA coverage."
    );
  });

  it("keeps bold text at the start of a line out of the bullet list", () => {
    const el = html("**Caveats.**\n- One.");
    expect(el.querySelector("p strong")?.textContent).toBe("Caveats.");
    expect(el.querySelectorAll("li")).toHaveLength(1);
  });

  it("renders a numbered list of bold-titled items as steps", () => {
    const el = html(
      "Four phases:\n1. **Fill the low brackets.** *2026 to 2027.* Income is small.\n2. **Taper.** Conversions shrink."
    );
    const steps = el.querySelector('[data-ui="steps"]');
    expect(steps).not.toBeNull();
    const items = steps!.querySelectorAll(":scope > li");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Fill the low brackets");
    expect(items[0].textContent).not.toContain("brackets.");
    expect(items[0].textContent).toContain("2026 to 2027");
    expect(items[0].textContent).toContain("Income is small.");
    expect(items[1].textContent).toContain("Conversions shrink.");
  });

  it("keeps steps while the last item is still streaming in", () => {
    const el = html("1. **Fill the low brackets.** Income is small.\n2. **Tap");
    expect(el.querySelector('[data-ui="steps"]')).not.toBeNull();
  });

  it("keeps a plain numbered list when items have no bold titles", () => {
    const el = html("1. **Convert.** Pay the tax.\n2. Wait five years.\n3. Withdraw.");
    expect(el.querySelector('[data-ui="steps"]')).toBeNull();
    expect(el.querySelectorAll("ol li")).toHaveLength(3);
  });

  it("keeps one list across blank lines between items", () => {
    const el = html("Phases:\n\n1. **Start.** Convert.\n\n2. **Taper.** Less.\n\nThat is it.");
    expect(el.querySelectorAll('[data-ui="steps"] > li')).toHaveLength(2);
    expect(el.querySelectorAll("p")).toHaveLength(4);
  });

  it("splits paragraphs on blank lines", () => {
    const el = html("One.\n\nTwo.\nStill two.");
    const ps = el.querySelectorAll(":scope > p");
    expect(ps).toHaveLength(2);
    expect(ps[1].innerHTML).toContain("<br>");
  });
});
