import { fireEvent, render, screen } from "@testing-library/react";
import {
  BalanceComparison,
  BracketFillChart,
  ResultCard,
  ScenarioCompareCard,
  ScenarioSummary,
  type ResultCardData,
  type ResultDetails,
  type ScenarioCompareData,
  type ScenarioSummaryData,
} from "@lucerna/ui";
import fixture from "../../../../../shared/fixtures/view-data.json";
import { MetricCard } from "../MetricCard";

const card = fixture.analyze_roth_conversions.structured_content as unknown as ResultCardData;
const details = fixture.analyze_roth_conversions.view_meta as unknown as ResultDetails;
const compare = fixture.compare_roth_scenarios.structured_content as unknown as ScenarioCompareData;
const recorded = fixture.record_scenario.structured_content as unknown as ScenarioSummaryData;

it("renders the result card from tool output", () => {
  const open = vi.fn();
  render(<ResultCard data={card} onOpenFullResults={open} />);
  expect(screen.getByText("Estimated lifetime tax savings")).toBeInTheDocument();
  const bars = screen.getAllByRole("img", { name: /converted$/ });
  expect(bars).toHaveLength(card.schedule_by_year.length);
  fireEvent.focus(bars[0]);
  expect(screen.getByRole("status")).toHaveTextContent(String(card.schedule_by_year[0].year));
  fireEvent.click(screen.getByRole("button", { name: "See full results" }));
  expect(open).toHaveBeenCalled();
});

it("opens the result card's chart panels", () => {
  render(<ResultCard data={card} details={details} />);
  expect(screen.queryByRole("button", { name: "See full results" })).not.toBeInTheDocument();
  const brackets = screen.getByRole("button", { name: "Tax brackets by year" });
  fireEvent.click(brackets);
  expect(brackets).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("img", { name: /colored by tax bracket/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Balances over time" }));
  expect(screen.queryByRole("img", { name: /colored by tax bracket/ })).not.toBeInTheDocument();
  expect(screen.getByText("Roth at retirement")).toBeInTheDocument();
});

it("renders the standalone charts with their own titles", () => {
  render(
    <>
      <BracketFillChart data={details.bracket_fill!} />
      <BalanceComparison data={details.balances!} />
    </>
  );
  expect(screen.getByText("How conversions fill your tax brackets")).toBeInTheDocument();
  expect(screen.getByText("Your traditional balance over time")).toBeInTheDocument();
});

it("renders the what-if card with its actions", () => {
  const apply = vi.fn();
  const { rerender } = render(<ScenarioCompareCard data={compare} onApply={apply} />);
  expect(screen.getByRole("heading", { name: compare.label })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apply to my scenario" }));
  expect(apply).toHaveBeenCalled();
  rerender(<ScenarioCompareCard data={compare} onApply={apply} applied />);
  expect(screen.getByRole("button", { name: "Applied to your scenario" })).toBeDisabled();
});

it("renders the scenario summary read-only or editable", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ScenarioSummary data={recorded} missing={["age"]} />);
  expect(screen.getByText("California, then Arizona")).toBeInTheDocument();
  expect(screen.getByText(/Sabbatical/)).toBeInTheDocument();
  expect(screen.getByText("Still needed: age.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();

  rerender(<ScenarioSummary data={recorded} onEdit={onEdit} onRun={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "60" }));
  const input = screen.getByLabelText("Age");
  fireEvent.change(input, { target: { value: "61" } });
  fireEvent.blur(input);
  expect(onEdit).toHaveBeenCalledWith({ age: 61 });
});

it("web MetricCard wraps the shared one", () => {
  render(<MetricCard label="Roth" value="$1" delta="+5%" deltaType="positive" />);
  const metric = screen.getByText("Roth").closest("[data-ui=metric-card]");
  expect(metric).toHaveClass("card");
  expect(screen.getByText("+5%")).toHaveClass("text-optimal");
});
