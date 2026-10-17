"""Display data for MCP App Views (app/tools/views.py)."""

from app.engine.optimizer import optimize
from app.tools.views import CURVE_VIEW_POINTS, curve_points, curve_view, result_view


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
