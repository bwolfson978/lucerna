import { fireEvent, render, screen } from "@testing-library/react";
import { ResultCard, type ResultCardData } from "@lucerna/ui";
import fixture from "../../../../../shared/fixtures/result-card-data.json";
import { MetricCard } from "../MetricCard";

const data = fixture.structured_content as unknown as ResultCardData;

it("renders the shared result card from tool output", () => {
  const open = vi.fn();
  render(<ResultCard data={data} onOpenFullResults={open} />);
  expect(screen.getByText("Estimated lifetime tax savings")).toBeInTheDocument();
  expect(screen.getByText(String(data.years_with_conversions))).toBeInTheDocument();
  const bars = screen.getAllByRole("img", { name: /converted$/ });
  expect(bars).toHaveLength(data.schedule_by_year.length);
  fireEvent.focus(bars[0]);
  expect(screen.getByRole("status")).toHaveTextContent(String(data.schedule_by_year[0].year));
  fireEvent.click(screen.getByRole("button", { name: "See full results" }));
  expect(open).toHaveBeenCalled();
});

it("hides the button without a handler", () => {
  render(<ResultCard data={data} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("web MetricCard wraps the shared one", () => {
  render(<MetricCard label="Roth" value="$1" delta="+5%" deltaType="positive" />);
  const card = screen.getByText("Roth").closest("[data-ui=metric-card]");
  expect(card).toHaveClass("card");
  expect(screen.getByText("+5%")).toHaveClass("text-optimal");
});
