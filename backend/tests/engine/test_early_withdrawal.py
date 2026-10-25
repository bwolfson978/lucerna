"""Withdrawals before 59½: the 10% penalty, the five-year clock on conversions and
the penalty-free spending order."""

import pytest

from app.engine.early_withdrawal import (
    age_59_half,
    early_fraction,
    has_early_spending,
    penalty_free_draws,
)
from app.engine.optimizer import calculate_npv, optimize
from app.engine.retirement import resolve_drawdowns, resolve_states
from app.tools.draft import ScenarioDraft, build_scenario_input, sync_timeline


def scenario(birth_year=1981, birth_month=6, **values):
    draft = ScenarioDraft(
        birth_year=birth_year,
        birth_month=birth_month,
        filing_status="single",
        **{
            "current_income": 100_000,
            "traditional_balance": 800_000,
            "roth_balance": 50_000,
            "retirement_age": 50,
            "retirement_spending": 60_000,
            **values,
        },
    )
    sync_timeline(draft, None, 2026)
    return resolve_states(resolve_drawdowns(build_scenario_input(draft)))


@pytest.mark.parametrize(
    ("month", "reached"),
    [(1, (2040, 7)), (6, (2040, 12)), (7, (2041, 1)), (12, (2041, 6)), (None, (2040, 7))],
)
def test_59_half_is_reached_six_months_after_the_59th_birthday(month, reached):
    # Engine input without a month (built by hand) assumes midway through the year
    s = scenario().model_copy(update={"birth_month": month})
    assert age_59_half(s) == reached


def test_the_year_59_half_is_reached_is_split_by_month():
    s = scenario(birth_month=6)  # reaches 59½ in December 2040
    assert early_fraction(s, 2039 - 2026) == 1
    assert early_fraction(s, 2040 - 2026) == pytest.approx(11 / 12)
    assert early_fraction(s, 2041 - 2026) == 0


def test_spending_before_59_half_pays_10_percent_on_traditional_draws():
    s = scenario()
    result = optimize(s)
    rows = {row["year"]: row for row in result.yearly_detail}
    for year in range(2031, 2040):
        row = rows[year]
        assert row["early_withdrawal_penalty"] == pytest.approx(
            0.10 * row["spending_from_traditional"], abs=1
        )
    assert rows[2040]["early_withdrawal_penalty"] == pytest.approx(
        0.10 * 11 / 12 * rows[2040]["spending_from_traditional"], abs=1
    )
    assert all(rows[year]["early_withdrawal_penalty"] == 0 for year in range(2041, 2056))


def test_spending_comes_from_the_existing_roth_balance_first():
    s = scenario()
    draws = penalty_free_draws(s, [0.0] * len(s.timeline))
    assert draws[2031 - 2026] == pytest.approx(50_000)
    assert sum(draws) == pytest.approx(50_000)
    # Only before 59½: after it, spending is traditional first again
    later = scenario(retirement_age=62)
    assert not has_early_spending(later)
    assert sum(penalty_free_draws(later, [0.0] * len(later.timeline))) == 0


def test_a_conversion_is_penalty_free_five_years_later():
    s = scenario(roth_balance=0)
    conversions = [0.0] * len(s.timeline)
    conversions[2031 - 2026] = 30_000
    draws = penalty_free_draws(s, conversions)
    assert draws[2035 - 2026] == 0
    assert draws[2036 - 2026] == pytest.approx(30_000)


def test_conversions_themselves_are_not_penalized():
    s = scenario(retirement_age=62)
    conversions = [50_000.0] * 5 + [0.0] * (len(s.timeline) - 5)
    assert calculate_npv(s, conversions) == calculate_npv(
        s.model_copy(update={"birth_month": 12}), conversions
    )


def test_the_optimizer_builds_a_conversion_ladder_for_an_early_retiree():
    s = scenario()
    result = optimize(s)
    summary = result.reasoning_trace.early_withdrawal_summary
    assert summary["age_59_half_year"] == 2040
    assert summary["total_penalty_with_conversion"] < summary["total_penalty_no_conversion"]
    # Conversions five years before the early retirement years pay for spending then
    assert any(row["amount"] > 0 for row in summary["penalty_free_roth_by_year"][1:])
    assert result.estimated_lifetime_tax_savings > 0
    assert "—" not in summary["explanation"]
    assert "you should" not in summary["explanation"].lower()


def test_no_summary_without_spending_before_59_half():
    result = optimize(scenario(retirement_age=62))
    assert result.reasoning_trace.early_withdrawal_summary is None


def test_the_tool_summary_carries_the_59_half_explanation():
    from app.tools import core

    s = scenario()
    result = optimize(s)
    summary = core.summarize_result(result, "r_test")
    assert summary["reasoning"]["early_withdrawal_summary"]["age_59_half_year"] == 2040
    assert "early-withdrawals" in {t["id"] for t in core.methodology_topics()}
