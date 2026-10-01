"""Regenerate shared/fixtures/result-card-data.json from the real MCP tool.

Run from backend/:  python -m scripts.generate_result_card_fixture

The fixture holds one `analyze_roth_conversions` call as a host sees it: the
`structuredContent` (what the MCP App View renders) and the full engine result (what
the web app's native card renders). Tests on both sides use it to keep the shared
ResultCard's data contract (ui/src/ResultCard.tsx ResultCardData) in step:
backend/tests/mcp/test_result_card_contract.py and
frontend/src/lib/results/__tests__/cardData.test.ts.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from mcp.shared.memory import create_connected_server_and_client_session

from app.mcp.server import RESULTS_META_KEY, UI_META_KEY, mcp

OUTPUT = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "result-card-data.json"

SCENARIO = {
    "age": 60,
    "filing_status": "married_filing_jointly",
    "current_income": 120000,
    "traditional_balance": 900000,
    "roth_balance": 50000,
    "retirement_age": 63,
}


async def generate() -> dict:
    async with create_connected_server_and_client_session(mcp) as session:
        analyzed = await session.call_tool(
            "analyze_roth_conversions",
            {"scenario": SCENARIO, "user_confirmed": True},
            meta={UI_META_KEY: True},
        )
    [entry] = analyzed.meta[RESULTS_META_KEY]
    return {
        "scenario": SCENARIO,
        "structured_content": analyzed.structuredContent,
        "result_id": entry["result_id"],
        # The conversion curve is chart-only and most of the payload; neither card reads it.
        "result": {**entry["result"], "conversion_curve": []},
    }


def main() -> None:
    data = asyncio.run(generate())
    OUTPUT.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
