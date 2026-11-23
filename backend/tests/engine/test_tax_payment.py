"""Who pays the tax: what must always be true (formal/lean/Lucerna/TaxPayment.lean).

The Lean model proves two things about a small world. With one flat tax rate a
conversion can show neither a gain nor a loss, whatever the investment return
(`income_neutral`, `accounts_neutral`), which the earlier valuation broke
(`old_breaks_neutrality`). And only one withdrawal leaves a given budget after tax
(`gross_up_unique`). These tests replay both against the real engine, along with the
rows of the proposal's "what must always be true" table that they stand for.
"""

import pytest

from app.engine.optimizer import calculate_npv, optimize
from app.engine.types import FilingStatus, PlanYear, ScenarioInput
from app.engine.year_tax import YearTax, year_tax

FLAT_RATE = 0.20


@pytest.fixture
def flat_tax(monkeypatch):
    """Every dollar of income is taxed at one flat rate, in every year."""
    monkeypatch.setattr(YearTax, "federal", lambda self, income: FLAT_RATE * income)
    monkeypatch.setattr(YearTax, "state_tax", lambda self, income: 0.0 * income)
    monkeypatch.setattr(YearTax, "total", lambda self, income: FLAT_RATE * income)


def _retired(**overrides) -> ScenarioInput:
    """A retired household, 60 to 62: past 59½, before Medicare's income lookback and
    RMDs, with the plan ending in its last timeline year."""
    defaults = dict(
        age=60,
        filing_status=FilingStatus.SINGLE,
        timeline=[PlanYear(year=2026 + i, gross_income=10_000, drawdown=50_000) for i in range(3)],
        traditional_ira_balance=1_000_000,
        roth_ira_balance=200_000,
        drawdown_start_age=60,
        planning_horizon_age=62,
        annual_growth_rate=0.07,
    )
    defaults.update(overrides)
    return ScenarioInput(**defaults)


def _working(**overrides) -> ScenarioInput:
    """A working household, 50 to 54, that draws nothing from its accounts."""
    defaults = dict(
        age=50,
        filing_status=FilingStatus.SINGLE,
        timeline=[PlanYear(year=2026 + i, gross_income=100_000) for i in range(5)],
        traditional_ira_balance=600_000,
        roth_ira_balance=50_000,
        drawdown_start_age=55,
        planning_horizon_age=54,
        annual_growth_rate=0.07,
    )
    defaults.update(overrides)
    return ScenarioInput(**defaults)


class TestFlatRateNeutrality:
    """If every dollar were taxed at one flat rate, converting shows no gain and no loss."""

    @pytest.mark.parametrize("conversions", [[100_000, 0, 0], [50_000, 150_000, 0]])
    def test_in_retirement_the_tax_comes_out_of_the_accounts(self, flat_tax, conversions):
        scenario = _retired()
        without = calculate_npv(scenario, [0.0, 0.0, 0.0])
        assert calculate_npv(scenario, conversions) == pytest.approx(without, abs=1.0)

    @pytest.mark.parametrize("conversions", [[80_000, 0, 0, 0, 0], [0, 40_000, 0, 120_000, 0]])
    def test_while_working_the_tax_comes_out_of_income(self, flat_tax, conversions):
        scenario = _working()
        without = calculate_npv(scenario, [0.0] * 5)
        assert calculate_npv(scenario, conversions) == pytest.approx(without, abs=1.0)

    @pytest.mark.parametrize("growth", [0.03, 0.07, 0.10])
    def test_at_any_investment_return(self, flat_tax, growth):
        scenario = _retired(annual_growth_rate=growth)
        without = calculate_npv(scenario, [0.0, 0.0, 0.0])
        assert calculate_npv(scenario, [200_000, 0, 0]) == pytest.approx(without, abs=1.0)


def _after_tax_spending(scenario: ScenarioInput, detail: dict, t: int) -> float:
    """What the household has left to spend in year ``t``: income and withdrawals,
    less the year's whole tax bill (conversion included) and any penalty."""
    taxed = (
        detail["income"]
        + detail["rmd"]
        + detail["conversion"]
        + detail["spending_from_traditional"]
    )
    return (
        detail["income"]
        + detail["rmd"]
        + detail["spending_from_traditional"]
        + detail["spending_from_roth"]
        - detail["early_withdrawal_penalty"]
        - year_tax(scenario, t).total(taxed)
    )


BUDGET = 90_000


@pytest.fixture(scope="module")
def retired_couple():
    scenario = ScenarioInput(
        age=62,
        filing_status=FilingStatus.MFJ,
        timeline=[PlanYear(year=2026 + i, gross_income=20_000) for i in range(8)],
        traditional_ira_balance=1_800_000,
        roth_ira_balance=150_000,
        drawdown_start_age=62,
        default_drawdown=BUDGET,
        planning_horizon_age=69,
        annual_growth_rate=0.07,
    )
    return scenario, optimize(scenario)


class TestSpendingIsAfterTax:
    """Withdrawals leave the household its budget after every tax bill is paid."""

    def test_without_conversions_each_year_nets_the_budget(self, retired_couple):
        scenario, optimized = retired_couple
        no_conversion = optimized.conversion_curve[0]
        assert no_conversion.total_cap == 0
        for t, detail in enumerate(no_conversion.yearly_detail):
            assert _after_tax_spending(scenario, detail, t) == pytest.approx(BUDGET, abs=2.0)

    def test_a_conversion_year_nets_the_same_budget(self, retired_couple):
        """The conversion's tax comes out of the accounts, not out of nowhere and not
        out of what the household spends."""
        scenario, optimized = retired_couple
        converting = [
            point for point in optimized.conversion_curve if 200_000 <= point.total_cap <= 900_000
        ]
        assert converting
        for point in converting[::10]:
            assert sum(d["conversion"] for d in point.yearly_detail) > 0
            for t, detail in enumerate(point.yearly_detail):
                assert detail.get("spending_shortfall", 0) == 0
                assert _after_tax_spending(scenario, detail, t) == pytest.approx(BUDGET, abs=2.0)


def test_there_is_no_second_rate():
    """Money outside the accounts grows like money inside them, so there is no
    discount rate that could make a plan look better or worse. A scenario saved
    with one still loads, and the rate changes nothing."""
    plain = optimize(_retired())
    for rate in (0.03, 0.07):
        saved = optimize(ScenarioInput(**_retired().model_dump(), discount_rate=rate))
        assert saved.yearly_conversions == plain.yearly_conversions
        assert saved.estimated_lifetime_tax_savings == plain.estimated_lifetime_tax_savings


def test_no_withdrawal_is_larger_than_its_account():
    """A household that runs out of traditional money draws on Roth, and nothing goes
    below zero."""
    scenario = _retired(traditional_ira_balance=60_000, roth_ira_balance=400_000)
    optimized = optimize(scenario)
    trad, roth = scenario.traditional_ira_balance, scenario.roth_ira_balance
    for detail in optimized.yearly_detail:
        out_of_trad = detail["rmd"] + detail["conversion"] + detail["spending_from_traditional"]
        assert out_of_trad <= trad + 0.01
        trad = (trad - out_of_trad) * (1 + scenario.real_growth_rate)
        assert detail["spending_from_roth"] <= roth + detail["conversion"] + 0.01
        roth = (roth + detail["conversion"] - detail["spending_from_roth"]) * (
            1 + scenario.real_growth_rate
        )
