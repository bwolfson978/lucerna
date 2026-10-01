"""The shared ResultCard (ui/src/ResultCard.tsx) renders analyze_roth_conversions'
structuredContent inside the MCP App View, and the same component renders natively in
the web app. These keys are its data contract (ResultCardData)."""

import json
from pathlib import Path

from mcp.shared.memory import create_connected_server_and_client_session

from app.mcp.server import mcp
from scripts.generate_result_card_fixture import SCENARIO

FIXTURE = Path(__file__).resolve().parents[3] / "shared" / "fixtures" / "result-card-data.json"

CARD_FIELDS = {
    "result_id": str,
    "estimated_lifetime_tax_savings_todays_dollars": int,
    "total_conversion": int,
    "total_tax_on_conversions": int,
    "years_with_conversions": int,
    "schedule_by_year": list,
}


def _check_card_fields(data: dict) -> None:
    for key, kind in CARD_FIELDS.items():
        assert isinstance(data[key], kind), key
    for row in data["schedule_by_year"]:
        assert isinstance(row["year"], int) and isinstance(row["conversion"], int)


async def test_structured_content_carries_the_card_fields():
    async with create_connected_server_and_client_session(mcp) as session:
        analyzed = await session.call_tool(
            "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": True}
        )
    _check_card_fields(analyzed.structuredContent)


def test_shared_fixture_matches_the_live_shape():
    """The fixture the frontend tests use has the live payload's keys. Regenerate it with
    `python -m scripts.generate_result_card_fixture` after changing summarize_result."""
    fixture = json.loads(FIXTURE.read_text())
    _check_card_fields(fixture["structured_content"])
    assert fixture["structured_content"]["result_id"] == fixture["result_id"]
    assert fixture["scenario"] == SCENARIO
