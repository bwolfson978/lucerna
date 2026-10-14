"""Tools with MCP App Views render through shared components (ui/), natively in the web
app and inside the Views. These are the components' data contracts, checked live and
against shared/fixtures/view-data.json, which the frontend tests also use. Regenerate
the fixture with `python -m scripts.generate_view_fixtures` after changing a payload."""

import json
from pathlib import Path

from mcp.shared.memory import create_connected_server_and_client_session

from app.mcp.server import mcp
from app.tools.views import VIEW_META_KEY
from scripts.generate_view_fixtures import CHANGES, LABEL, SCENARIO

FIXTURE = Path(__file__).resolve().parents[3] / "shared" / "fixtures" / "view-data.json"


def _shape(value):
    """A JSON value's structure: dict keys and element shapes, with scalars as types."""
    if isinstance(value, dict):
        return {k: _shape(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_shape(value[0])] if value else []
    if isinstance(value, bool) or value is None:
        return type(value).__name__
    return "number" if isinstance(value, int | float) else type(value).__name__


def _check_result_card(data: dict) -> None:
    for key in (
        "estimated_lifetime_tax_savings_todays_dollars",
        "total_conversion",
        "total_tax_on_conversions",
        "years_with_conversions",
    ):
        assert isinstance(data[key], int), key
    assert isinstance(data["result_id"], str)
    for row in data["schedule_by_year"]:
        assert isinstance(row["year"], int) and isinstance(row["conversion"], int)


async def _live() -> dict:
    async with create_connected_server_and_client_session(mcp) as session:
        recorded = await session.call_tool("prepare_scenario", {"scenario": SCENARIO})
        analyzed = await session.call_tool(
            "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": True}
        )
        compared = await session.call_tool(
            "compare_roth_scenarios", {"scenario": SCENARIO, "changes": CHANGES, "label": LABEL}
        )
    return {"record": recorded, "analyze": analyzed, "compare": compared}


async def test_live_payloads_match_the_fixture_shapes():
    live = await _live()
    fixture = json.loads(FIXTURE.read_text())

    _check_result_card(live["analyze"].structuredContent)
    assert _shape(live["analyze"].meta[VIEW_META_KEY]) == _shape(
        fixture["analyze_roth_conversions"]["view_meta"]
    )
    assert _shape(live["analyze"].structuredContent) == _shape(
        fixture["analyze_roth_conversions"]["structured_content"]
    )
    assert _shape(live["compare"].structuredContent) == _shape(
        fixture["compare_roth_scenarios"]["structured_content"]
    )
    assert _shape(live["record"].structuredContent) == _shape(
        fixture["prepare_scenario"]["structured_content"]
    )


def test_fixture_is_consistent():
    fixture = json.loads(FIXTURE.read_text())
    analysis = fixture["analyze_roth_conversions"]
    _check_result_card(analysis["structured_content"])
    assert analysis["structured_content"]["result_id"] == analysis["result_id"]
    assert fixture["scenario"] == SCENARIO
    view = analysis["view_meta"]
    assert [y["year"] for y in view["bracket_fill"]["years"]] == [
        r["year"] for r in analysis["structured_content"]["schedule_by_year"]
    ]
    assert fixture["prepare_scenario"]["structured_content"]["ready_to_run"] is True


def test_card_button_messages_are_ones_the_agents_handle():
    """Card buttons send these chat messages (ui/src/messages.ts); the prompts and the
    offline model recognize them."""
    from app.agent.prompts import SYSTEM_PROMPT
    from app.mcp.server import INSTRUCTIONS

    messages = (FIXTURE.parents[2] / "ui" / "src" / "messages.ts").read_text()
    assert '"Looks right. Run the numbers."' in messages
    assert "what-if as my scenario" in messages
    assert "Apply to my scenario" in SYSTEM_PROMPT
    assert "Looks right. Run the numbers." in INSTRUCTIONS
