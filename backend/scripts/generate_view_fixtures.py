"""Regenerate shared/fixtures/view-data.json from the real MCP tools.

Run from backend/:  python -m scripts.generate_view_fixtures

The fixture holds one call of each tool that has an MCP App View, as a host sees it:
the `structuredContent` and View `_meta` (what the View renders) and the full engine
results (what the web app's native cards render). Both renderers use the same shared
components (ui/), so tests on both sides check their data against this file:
backend/tests/mcp/test_view_contracts.py and
frontend/src/lib/results/__tests__/viewData.test.ts.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from mcp.shared.memory import create_connected_server_and_client_session

from app.mcp.server import RESULTS_META_KEY, UI_META_KEY, mcp
from app.tools.views import VIEW_META_KEY

OUTPUT = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "view-data.json"

SCENARIO = {
    "birth_year": 1966,
    "birth_month": 6,
    "filing_status": "married_filing_jointly",
    "spouse_birth_year": 1966,
    "spouse_birth_month": 6,
    "current_income": 120000,
    "traditional_balance": 900000,
    "roth_balance": 50000,
    "retirement_age": 63,
    "state": "CA",
    "retirement_state": "AZ",
    "income_changes": [{"year": 2027, "gross_income": 60000, "note": "Part-time year"}],
}
CHANGES = {"retirement_age": 62}
LABEL = "Retire at 62"


async def generate() -> dict:
    ui = {UI_META_KEY: True}
    async with create_connected_server_and_client_session(mcp) as session:
        recorded = await session.call_tool("prepare_scenario", {"scenario": SCENARIO})
        analyzed = await session.call_tool(
            "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": True}, meta=ui
        )
        compared = await session.call_tool(
            "compare_roth_scenarios",
            {"scenario": SCENARIO, "changes": CHANGES, "label": LABEL},
            meta=ui,
        )
    [analysis] = analyzed.meta[RESULTS_META_KEY]
    return {
        "scenario": SCENARIO,
        "prepare_scenario": {"structured_content": recorded.structuredContent},
        "analyze_roth_conversions": {
            "structured_content": analyzed.structuredContent,
            "view_meta": analyzed.meta[VIEW_META_KEY],
            "result_id": analysis["result_id"],
            # The full result as the web app gets it, display data included.
            "result": analysis["result"],
        },
        "compare_roth_scenarios": {
            "changes": CHANGES,
            "label": LABEL,
            "structured_content": compared.structuredContent,
        },
    }


def main() -> None:
    data = asyncio.run(generate())
    OUTPUT.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
