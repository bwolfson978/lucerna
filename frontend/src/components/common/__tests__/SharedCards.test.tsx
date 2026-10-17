import { fireEvent, render, screen } from "@testing-library/react";
import {
  BracketFillChart,
  ResultCard,
  isResultDetails,
  ScenarioCompareCard,
  ScenarioSummary,
  type ResultCardData,
  type ResultDetails,
  type ScenarioCompareData,
  type ScenarioSummaryData,
} from "@lucerna/ui";
import fixture from "../../../../../shared/fixtures/view-data.json";
import previous from "../../../../../shared/fixtures/view-data-previous.json";
import { MetricCard } from "../MetricCard";

const card = fixture.analyze_roth_conversions.structured_content as unknown as ResultCardData;
const details = fixture.analyze_roth_conversions.view_meta as unknown as ResultDetails;
const compare = fixture.compare_roth_scenarios.structured_content as unknown as ScenarioCompareData;
const recorded = fixture.prepare_scenario.structured_content as unknown as ScenarioSummaryData;

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

it("shows the tax bracket chart in the result card", () => {
  render(<ResultCard data={card} details={details} />);
  expect(screen.queryByRole("button", { name: "See full results" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Balances over time/ })).not.toBeInTheDocument();
  // The results page's chart: bracket lines, the 0% standard deduction band and the
  // rows under the bars (each year's conversion and the tax it adds).
  expect(screen.getByRole("img", { name: /against the tax brackets/ })).toBeInTheDocument();
  expect(screen.getAllByText(/^0%/).length).toBeGreaterThan(0);
  expect(screen.getByText("Convert")).toBeInTheDocument();
  expect(screen.getByText("Tax")).toBeInTheDocument();
  expect(screen.getByText("Room left in bracket")).toBeInTheDocument();
});

it("renders the previous release's tool output without the chart instead of crashing", () => {
  // A newer frontend can meet an older server (deploys roll out separately) or a
  // conversation saved before the change. The card must degrade, not throw.
  const old = previous.analyze_roth_conversions;
  expect(isResultDetails(old.view_meta)).toBe(false);
  render(
    <ResultCard
      data={old.structured_content as unknown as ResultCardData}
      details={old.view_meta as unknown as ResultDetails}
    />
  );
  expect(screen.getByText("Estimated lifetime tax savings")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /against the tax brackets/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: /converted$/ })).toHaveLength(
    old.structured_content.schedule_by_year.length
  );
});

it("renders the standalone chart with its own title", () => {
  render(<BracketFillChart data={details.bracket_fill!} />);
  expect(screen.getByText("How conversions fill your tax brackets")).toBeInTheDocument();
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
  // Read-only: nothing to edit, only the assumptions disclosure.
  expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-expanded"))).toEqual([
    "false",
  ]);

  rerender(<ScenarioSummary data={recorded} onEdit={onEdit} onRun={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "60" }));
  const input = screen.getByLabelText("Age");
  fireEvent.change(input, { target: { value: "61" } });
  fireEvent.blur(input);
  expect(onEdit).toHaveBeenCalledWith({ age: 61 });
});

it("folds a summary already run to a one-line recap", () => {
  render(<ScenarioSummary data={recorded} badge="Confirmed" collapsible />);
  const header = screen.getByRole("button", { name: /Your scenario/ });
  expect(header).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Confirmed")).toBeInTheDocument();
  expect(screen.queryByText("California, then Arizona")).not.toBeInTheDocument();
  expect(
    screen.getByText(/^Age \d+ · .+ income · .+ traditional · drawing at \d+$/)
  ).toBeInTheDocument();

  fireEvent.click(header);
  expect(header).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("California, then Arizona")).toBeInTheDocument();
});

it("folds default assumptions into one line until asked for", () => {
  const onEdit = vi.fn();
  render(<ScenarioSummary data={recorded} onEdit={onEdit} />);
  const toggle = screen.getByRole("button", { name: /Assumptions/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveTextContent(/\d+% growth · \d+% return · age \d+/);
  expect(screen.queryByText("Plan through age")).not.toBeInTheDocument();

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Plan through age")).toBeInTheDocument();
  expect(screen.getByText("Investment return")).toBeInTheDocument();
  expect(screen.getByText("Income growth")).toBeInTheDocument();
});

it("edits the state row in place with a pair of selects", () => {
  const onEdit = vi.fn();
  const onOpenForm = vi.fn();
  render(<ScenarioSummary data={recorded} onEdit={onEdit} onOpenForm={onOpenForm} />);
  fireEvent.click(screen.getByRole("button", { name: "California, then Arizona" }));
  expect(onOpenForm).not.toHaveBeenCalled();

  // A different retirement state stays put when today's state changes.
  fireEvent.change(screen.getByLabelText("Now"), { target: { value: "TX" } });
  expect(onEdit).toHaveBeenLastCalledWith({ state: "TX", retirement_state: "AZ" });
  fireEvent.change(screen.getByLabelText("In retirement"), { target: { value: "none" } });
  expect(onEdit).toHaveBeenLastCalledWith({ retirement_state: null });

  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByLabelText("Now")).not.toBeInTheDocument();
});

it("asks for a rate when the state is Other", () => {
  const onEdit = vi.fn();
  const data = {
    ...recorded,
    scenario: { ...recorded.scenario, state: "custom", retirement_state: null },
  };
  render(<ScenarioSummary data={data} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("button", { name: "Other" }));
  const rate = screen.getByLabelText("State tax rate (%)");
  fireEvent.change(rate, { target: { value: "4.5" } });
  fireEvent.blur(rate);
  expect(onEdit).toHaveBeenLastCalledWith({ custom_state_rate_pct: 4.5 });
});

it("as the website's scenario panel, offers Add for missing values and marks new ones", () => {
  const onEdit = vi.fn();
  const data = { ...recorded, scenario: { ...recorded.scenario, age: null } };
  const { container } = render(
    <ScenarioSummary
      data={data}
      variant="panel"
      onEdit={onEdit}
      highlight={["traditional_balance"]}
    />
  );
  // No card header or Run button: the panel has its own.
  expect(container.querySelector("[data-ui=scenario-summary]")).toHaveAttribute(
    "data-variant",
    "panel"
  );
  expect(screen.queryByRole("button", { name: "Run the numbers" })).not.toBeInTheDocument();
  expect(screen.getAllByText("New")).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Add age" }));
  const age = screen.getByLabelText("Age");
  fireEvent.change(age, { target: { value: "58" } });
  fireEvent.blur(age);
  expect(onEdit).toHaveBeenLastCalledWith({ age: 58 });
});

it("web MetricCard wraps the shared one", () => {
  render(<MetricCard label="Roth" value="$1" delta="+5%" deltaType="positive" />);
  const metric = screen.getByText("Roth").closest("[data-ui=metric-card]");
  expect(metric).toHaveClass("card");
  expect(screen.getByText("+5%")).toHaveClass("text-optimal");
});
