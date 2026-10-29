"""LLM judges, the judged-case budget and the Langfuse dataset copy (no API calls)."""

import json

from evals import run_agent_evals
from evals.judges import Verdict, format_conversation, load_judges
from evals.run_agent_evals import CASES_FILE, Budget, Evaluator, run_local
from evals.sync_langfuse import item_id, wanted_items

CASES = json.loads(CASES_FILE.read_text())["cases"]


def test_every_judge_a_case_names_is_defined():
    judges = load_judges()
    assert set(judges) == {"answers_the_question", "explains_tradeoff"}
    for judge in judges.values():
        assert "{conversation}" in judge.prompt and "{reply}" in judge.prompt
    named = {name for c in CASES for name in c.get("judge", [])}
    assert named <= set(judges)


def test_conversation_ends_at_the_last_user_message():
    conversation, reply = format_conversation(
        [
            {"user": "Born 1974, married", "assistant": "Here's your scenario."},
            {"user": "Why not convert more?", "assistant": "Because the 22% bracket ends."},
        ]
    )
    assert conversation.endswith("User: Why not convert more?")
    assert "Here's your scenario." in conversation
    assert reply == "Because the 22% bracket ends."


def test_dataset_items_are_the_judged_cases():
    items = wanted_items(CASES)
    judged = [c for c in CASES if c.get("judge")]
    assert len(items) == len(judged) >= 15
    first = judged[0]
    assert items[item_id(first["id"])] == {
        "input": first["turns"],
        "metadata": {
            "case_id": first["id"],
            "category": first["category"],
            "judges": first["judge"],
        },
    }


class FakeJudgeClient:
    def __init__(self):
        self.calls = []

    async def judge(self, judge, transcript):
        self.calls.append(judge.name)
        return Verdict(judge=judge.name, passed=True, reason="ok", cost_usd=0.01)


def _case(case_id):
    return {
        "id": case_id,
        "category": "explanation",
        "judge": ["answers_the_question"],
        "turns": ["Hi"],
    }


def test_judges_run_on_judged_cases_and_the_budget_stops_new_ones(monkeypatch):
    async def fake_run_case(case, client):
        return run_agent_evals.CaseResult(
            case["id"], case["category"], True, [], 0.5, 0.1, [{"user": "Hi", "assistant": "Hello"}]
        )

    monkeypatch.setattr(run_agent_evals, "run_case", fake_run_case)
    evaluate = Evaluator(offline=False, budget=Budget(0.5))
    evaluate._client = object()
    evaluate._judge_client = FakeJudgeClient()

    results = run_local([_case("a"), _case("b")], evaluate, repeat=1, concurrency=1)

    assert [r.skipped for r in results] == [False, True]
    assert results[0].judges == [
        {"judge": "answers_the_question", "passed": True, "reason": "ok", "cost_usd": 0.01}
    ]
    assert results[0].cost_usd == 0.51
    assert evaluate.budget.spent == 0.51


def test_offline_runs_skip_the_judges(monkeypatch):
    async def fake_run_case(case, client):
        return run_agent_evals.CaseResult(case["id"], "x", True, [], 0.0, 0.0, [])

    monkeypatch.setattr(run_agent_evals, "run_case", fake_run_case)
    evaluate = Evaluator(offline=True, budget=Budget(None))
    evaluate._client = object()
    results = run_local([_case("a")], evaluate, repeat=1, concurrency=1)
    assert results[0].judges == [] and not results[0].skipped
