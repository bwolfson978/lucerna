"""The agent eval harness: grounding checks and a full offline case."""

import json

from app.agent.offline import OfflineModelClient
from app.tools.draft import ScenarioDraft
from evals.run_agent_evals import CASES_FILE, TurnRecord, check, grounded, money_amounts, run_case


def test_money_parsing_and_grounding():
    assert money_amounts("about $338,000 and $1.4 million, $20k") == [338000, 1_400_000, 20000]
    assert grounded(338000, [338077])
    assert not grounded(500000, [338077])


def test_checks_flag_framing_dashes_and_ungrounded_numbers():
    turn = TurnRecord(
        user="I'm 52",
        text="You should convert $999,999 now — trust me.",
        tool_results=['{"estimated_lifetime_tax_savings_todays_dollars": 338077}'],
    )
    failures = check({"expect": {}}, [turn], ScenarioDraft())
    assert any("you should" in f for f in failures)
    assert any("em dash" in f for f in failures)
    assert any("$999,999" in f for f in failures)


def test_cases_file_is_well_formed():
    cases = json.loads(CASES_FILE.read_text())["cases"]
    assert len(cases) >= 30
    assert len({c["id"] for c in cases}) == len(cases)


async def test_offline_case_runs_end_to_end():
    case = {
        "id": "x",
        "category": "intake",
        "turns": [
            "I'm 52, married, income $90,000 a year, $600k in my 401k, I want to retire at 60"
        ],
        "expect": {"tools_called": ["record_scenario"], "parts_shown": ["scenario_summary"]},
    }
    result = await run_case(case, OfflineModelClient())
    assert result.passed, result.failures
