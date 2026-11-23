"""Display data for MCP App Views (app/tools/views.py)."""

import pytest

from app.engine.optimizer import optimize
from app.tools import core
from app.tools.draft import ScenarioDraft
from app.tools.models import ScenarioUpdate
from app.tools.views import (
    CURVE_VIEW_POINTS,
    bracket_fill_view,
    curve_points,
    curve_view,
    result_view,
)


def test_curve_view_has_the_slider_points(sample_single_input):
    result = optimize(sample_single_input())
    view = curve_view(result)
    points = view["points"]
    assert len(points) <= CURVE_VIEW_POINTS + 2
    assert [p["total"] for p in points] == sorted(p["total"] for p in points)
    assert points[0]["total"] == 0 and points[0]["savings"] == 0
    years = len(result.input.timeline)
    assert all(len(p["conversions"]) == years and len(p["rmds"]) == years for p in points)
    best = [p for p in points if p["total"] == round(result.total_conversion)]
    assert best and best[0]["savings"] == round(result.estimated_lifetime_tax_savings)


def test_picking_points_again_returns_the_same_points(sample_single_input):
    """The web app repeats the pick on a stored result that kept only these points."""
    result = optimize(sample_single_input())
    picked = curve_points(result)
    again = curve_points(result.model_copy(update={"conversion_curve": picked}))
    assert [p.total_cap for p in again] == [p.total_cap for p in picked]


def test_no_curve_no_slider(sample_single_input):
    result = optimize(sample_single_input()).model_copy(update={"conversion_curve": []})
    assert curve_view(result) is None
    assert "curve" not in result_view(result)


# --------------------------------------------------------------------------
# The bracket chart's bars sit where the engine taxes
# --------------------------------------------------------------------------

# Each stacked amount is rounded to the dollar on its own
ROUNDING = 3

RETIRE_AT_62 = dict(
    birth_year=1971,
    birth_month=3,
    filing_status="single",
    current_income=95000,
    traditional_balance=650000,
    retirement_age=62,
)
BAR_SCENARIOS = {
    # Lives on the traditional account from 62: the conversion sits on that withdrawal
    "withdrawals": RETIRE_AT_62,
    # A small account and a benefit: part of Social Security is taxed, and more of it
    # as more is converted
    "social-security": dict(
        RETIRE_AT_62,
        traditional_balance=300000,
        retirement_spending=40000,
        income_sources=[
            dict(kind="social_security", owner="you", amount=30000, start_age=67),
            dict(kind="pension", owner="you", amount=6000, start_age=62),
        ],
    ),
    # Both 66 and retired: the 65+ deductions, and the senior deduction through 2028
    "already-65": dict(
        birth_year=1960,
        birth_month=5,
        spouse_birth_year=1960,
        spouse_birth_month=8,
        filing_status="married_filing_jointly",
        current_income=0,
        traditional_balance=1800000,
        roth_balance=80000,
        retirement_age=66,
        retirement_spending=110000,
        income_sources=[dict(kind="social_security", owner="you", amount=42000, start_age=67)],
    ),
}


@pytest.fixture(scope="module", params=sorted(BAR_SCENARIOS))
def bar_result(request):
    draft = core.apply_update(ScenarioDraft(), ScenarioUpdate(**BAR_SCENARIOS[request.param]), 2026)
    _, result = core.run_draft(draft)
    return result


def _bar_top(year: dict) -> int:
    """Where a year's bar ends: everything stacked in it, less the 65+ deductions."""
    return (
        year["income"]
        + year["rmd"]
        + year.get("withdrawal", 0)
        + year.get("taxable_social_security", 0)
        + year["conversion"]
        - year.get("extra_deduction", 0)
    )


def _assert_bars_match(years: list[dict], details: list[dict], deduction: int, where: str):
    for year, detail in zip(years, details, strict=True):
        taxable = max(0, _bar_top(year) - deduction)
        assert abs(taxable - detail["taxable_income"]) <= ROUNDING, (
            f"{where} {year['year']}: the bar ends at ${taxable:,} of taxable income, "
            f"the engine taxes ${detail['taxable_income']:,.0f}"
        )


def test_bars_end_at_the_engines_taxable_income(bar_result):
    """The chart draws a year's bar against the bracket lines, which sit at the standard
    deduction plus each bracket's top. So the bar has to end at the engine's taxable
    income plus the standard deduction, or the picture and the numbers disagree."""
    fill = bracket_fill_view(bar_result)
    _assert_bars_match(
        fill["years"], bar_result.yearly_detail, fill["standard_deduction"], "optimal"
    )


def test_bars_match_at_every_slider_point(bar_result):
    fill = bracket_fill_view(bar_result)
    view = curve_view(bar_result)
    points = curve_points(bar_result)
    assert len(view["points"]) == len(points) > 2
    for shown, point in zip(view["points"], points, strict=True):
        years = [
            {
                **year,
                "rmd": shown["rmds"][t],
                "conversion": shown["conversions"][t],
                "withdrawal": shown.get("withdrawals", [0] * len(fill["years"]))[t],
                "taxable_social_security": shown.get(
                    "taxable_social_security",
                    [year.get("taxable_social_security", 0)] * len(fill["years"]),
                )[t],
                "extra_deduction": shown.get("extra_deductions", [0] * len(fill["years"]))[t],
            }
            for t, year in enumerate(fill["years"])
        ]
        _assert_bars_match(
            years, point.yearly_detail, fill["standard_deduction"], f"total {shown['total']:,}"
        )
