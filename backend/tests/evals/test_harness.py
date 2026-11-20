"""The agent eval harness: grounding checks and a full offline case."""

import json

from app.agent.offline import OfflineModelClient
from app.tools.draft import ScenarioDraft
from evals.run_agent_evals import (
    CASES_FILE,
    TurnRecord,
    check,
    grounded,
    money_amounts,
    named_bracket_rates,
    run_case,
)


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
            "Born June 1974, my wife in March 1975, married, income $90,000 a year, $600k in my 401k, I want to retire at 60"
        ],
        "expect": {"tools_called": ["prepare_scenario"], "parts_shown": ["scenario_summary"]},
    }
    result = await run_case(case, OfflineModelClient())
    assert result.passed, result.failures


def test_quoting_the_question_is_not_advice():
    def says_you_should(text):
        failures = check({"expect": {}}, [TurnRecord(user="hi", text=text)], ScenarioDraft())
        return any("you should" in f for f in failures)

    assert not says_you_should("I can't tell you what you should convert.")
    assert not says_you_should("I can't say whether you should do it.")
    assert not says_you_should("This isn't advice about whether you should convert.")
    assert says_you_should("Based on this, you should convert now.")
    assert says_you_should("Here is what you should do: convert $40,000 a year.")
    assert says_you_should("If you're unsure, you should convert.")


def test_bare_user_numbers_can_mean_thousands():
    turn = TurnRecord(user="about 90, married, 500k in the IRA", text="Is that about $90,000?")
    assert check({"expect": {}}, [turn], ScenarioDraft()) == []
    turn = TurnRecord(user="about 90", text="Maybe $91,000,000?")
    assert any("not found" in f for f in check({"expect": {}}, [turn], ScenarioDraft()))


def test_named_brackets_must_be_real():
    def failures(text, draft=None, tool_results=()):
        turn = TurnRecord(user="hi", text=text, tool_results=list(tool_results))
        return [
            f for f in check({"expect": {}}, [turn], draft or ScenarioDraft()) if "bracket" in f
        ]

    assert failures("Converting more would push income into the 17% bracket.") == [
        "turn 1: 17% is not a tax bracket"
    ]
    assert not failures("It fills the 12% bracket and stops before the 22% bracket.")
    assert not failures(
        "The 10%, 12% and 22% brackets apply. The first slice is in the 0% bracket."
    )
    # Correcting a wrong premise names the rate without claiming it
    assert not failures("You're right that there's no 17% federal bracket.")
    assert not failures("17% isn't a tax bracket. It is a blend of the 12% and 22% brackets.")
    # A blended cost is fine as long as it isn't called a bracket
    assert not failures("The next $1,000 costs about 17% in tax, partly at 12% and partly at 22%.")
    assert named_bracket_rates("the 12% and 22% federal tax brackets") == [12, 22]
    # The next bracket given a made-up rate
    assert failures("The next bracket up is about 17% (the engine's effective rate).") == [
        "turn 1: 17% is not a tax bracket"
    ]
    assert failures("It would reach the next bracket (about 17% effective).")
    assert not failures("The next bracket is 22%, which costs more than it saves.")


def test_state_brackets_count_when_the_state_is_in_play():
    def failures(text, draft=None, tool_results=()):
        turn = TurnRecord(user="hi", text=text, tool_results=list(tool_results))
        return [
            f for f in check({"expect": {}}, [turn], draft or ScenarioDraft()) if "bracket" in f
        ]

    text = "California's 9.3% bracket applies on top of the federal 22% bracket."
    assert failures(text) == ["turn 1: 9.3% is not a tax bracket"]
    assert not failures(text, draft=ScenarioDraft(state="CA"))
    looked_up = json.dumps(
        {"state": {"brackets_on_taxable_income": [{"rate": 0.093, "income_from": 0}]}}
    )
    assert not failures(text, tool_results=[looked_up])
