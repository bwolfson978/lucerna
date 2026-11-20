"""Listing rated replies and reading the rated turn (made-up data, no API calls)."""

from evals import rated_replies
from evals.rated_replies import rated, turn

TRACE_A = "a" * 32
TRACE_B = "b" * 32


def _rating(trace_id: str, value: bool, when: str, comment: str | None = None) -> dict:
    return {
        "id": f"{trace_id}-user_rating",
        "name": "user_rating",
        "timestamp": when,
        "value": value,
        "comment": comment,
    }


RATINGS = [
    _rating(TRACE_B, True, "2026-01-02T10:00:00Z"),
    _rating(TRACE_A, False, "2026-01-01T10:00:00Z", "The surcharge was not explained."),
]
ISSUES = [{"id": f"{TRACE_A}-user_issue", "name": "user_issue", "value": "did_not_answer"}]


def test_thumbs_downs_carry_their_reason_note_and_trace():
    assert rated(RATINGS, ISSUES) == [
        {
            "when": "2026-01-01T10:00:00Z",
            "rating": "down",
            "reason": "did_not_answer",
            "note": "The surcharge was not explained.",
            "trace_id": TRACE_A,
        }
    ]


def test_all_lists_thumbs_ups_too_oldest_first():
    rows = rated(RATINGS, ISSUES, include_up=True)
    assert [(row["rating"], row["trace_id"], row["reason"]) for row in rows] == [
        ("down", TRACE_A, "did_not_answer"),
        ("up", TRACE_B, None),
    ]


def test_turn_is_the_message_the_tools_in_order_and_the_reply():
    observations = [
        {"type": "TOOL", "name": "show", "startTime": "3", "input": {"kind": "suggestions"}},
        {"type": "GENERATION", "name": "anthropic.messages.create", "startTime": "2"},
        {"type": "TOOL", "name": "analyze_roth_conversions", "startTime": "2", "input": "{}"},
        {
            "type": "AGENT",
            "name": "website_assistant",
            "startTime": "1",
            "input": "Run the numbers.",
            "output": "Here is the result.",
        },
    ]
    assert turn(observations) == {
        "user": "Run the numbers.",
        "tools": [
            {"name": "analyze_roth_conversions", "input": "{}"},
            {"name": "show", "input": '{"kind": "suggestions"}'},
        ],
        "reply": "Here is the result.",
    }


def test_without_keys_it_says_what_to_set(monkeypatch, capsys):
    class NoKeys:
        langfuse_public_key = ""
        langfuse_secret_key = ""

    monkeypatch.setattr(rated_replies, "settings", NoKeys)
    assert rated_replies.main([]) == 1
    assert "LANGFUSE_PUBLIC_KEY" in capsys.readouterr().out


def test_main_asks_for_the_window_and_prints_the_downs(monkeypatch, capsys):
    asked = []

    def fake_get(path, **params):
        asked.append((path, params["name"], params["environment"]))
        return {"data": RATINGS if params["name"] == "user_rating" else ISSUES}

    class Keys:
        langfuse_public_key = "pk"
        langfuse_secret_key = "sk"

    monkeypatch.setattr(rated_replies, "settings", Keys)
    monkeypatch.setattr(rated_replies, "_get", fake_get)
    assert rated_replies.main(["--days", "3"]) == 0
    assert asked == [
        ("v3/scores", "user_rating", "production"),
        ("v3/scores", "user_issue", "production"),
    ]
    out = capsys.readouterr().out
    assert TRACE_A in out and TRACE_B not in out
    assert "1 rated (1 down, 0 up)." in out
