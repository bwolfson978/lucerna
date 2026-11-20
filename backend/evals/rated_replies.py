"""List the replies people rated on the website, and read the conversation behind one.

Usage (from backend/, with both LANGFUSE keys set; LANGFUSE_TRACING can stay off):
    python -m evals.rated_replies                   # thumbs downs from the last 7 days
    python -m evals.rated_replies --days 30 --all   # thumbs ups too
    python -m evals.rated_replies --trace <id>      # the rated turn: message, tools, reply

This is the first step of the triage in AGENTS.md ("Rated replies"). It only reads.
What it prints is a real person's finances: read it in the terminal, and never paste it
into the repo, a PR or a chat. A failure worth keeping becomes a scrubbed case in
agent_cases.json.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.agent.feedback import ISSUE_SCORE, RATING_SCORE
from app.config import settings

PAGE = 100  # the most scores one request returns
AGENT_SPAN = "website_assistant"


def _get(path: str, **params: Any) -> dict:
    config = settings()
    response = httpx.get(
        f"{config.langfuse_base_url.rstrip('/')}/api/public/{path}",
        params=params,
        auth=(config.langfuse_public_key, config.langfuse_secret_key),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def _scores(name: str, environment: str, since: datetime) -> list[dict]:
    return _get(
        "v3/scores",
        name=name,
        environment=environment,
        fields="core,details",
        limit=PAGE,
        fromTimestamp=since.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )["data"]


def _trace_id(score: dict) -> str:
    """Score ids are "<trace id>-<score name>" (see app/agent/feedback.py)."""
    return score["id"].removesuffix(f"-{score['name']}")


def rated(ratings: list[dict], issues: list[dict], include_up: bool = False) -> list[dict]:
    """One row per rated reply, oldest first: when, up or down, reason, note, trace."""
    reason = {_trace_id(s): s["value"] for s in issues}
    rows = [
        {
            "when": s["timestamp"],
            "rating": "up" if s["value"] else "down",
            "reason": reason.get(_trace_id(s)),
            "note": s.get("comment"),
            "trace_id": _trace_id(s),
        }
        for s in ratings
        if include_up or not s["value"]
    ]
    return sorted(rows, key=lambda row: row["when"])


def _text(value: Any) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def turn(observations: list[dict]) -> dict:
    """The rated turn from its trace: the person's message, the tools called in order
    and the reply."""
    ordered = sorted(observations, key=lambda o: o.get("startTime") or "")
    agent = next((o for o in ordered if o.get("name") == AGENT_SPAN), {})
    return {
        "user": _text(agent.get("input") or ""),
        "tools": [
            {"name": o.get("name"), "input": _text(o.get("input") or "")}
            for o in ordered
            if o.get("type") == "TOOL"
        ],
        "reply": _text(agent.get("output") or ""),
    }


def _print_rows(rows: list[dict]) -> None:
    for row in rows:
        print(
            f"{row['when'][:16]}  {row['rating']:<4}  {row['reason'] or '-':<20}  {row['trace_id']}"
        )
        if row["note"]:
            print(f"    note: {row['note']}")
    downs = sum(row["rating"] == "down" for row in rows)
    print(f"{len(rows)} rated ({downs} down, {len(rows) - downs} up).")


def _print_turn(shown: dict) -> None:
    print(f"User:\n{shown['user']}\n")
    for tool in shown["tools"]:
        print(f"Tool {tool['name']}: {tool['input'][:400]}")
    print(f"\nReply:\n{shown['reply']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--all", action="store_true", help="include thumbs ups")
    parser.add_argument("--environment", default="production")
    parser.add_argument("--trace", help="print the rated turn of this trace id instead")
    args = parser.parse_args(argv)

    config = settings()
    if not (config.langfuse_public_key and config.langfuse_secret_key):
        print("Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.")
        return 1

    if args.trace:
        found = _get("v2/observations", fields="core,basic,io", traceId=args.trace, limit=PAGE)[
            "data"
        ]
        if not found:
            print("No such trace.")
            return 1
        _print_turn(turn(found))
        return 0

    since = datetime.now(UTC) - timedelta(days=args.days)
    ratings = _scores(RATING_SCORE, args.environment, since)
    issues = _scores(ISSUE_SCORE, args.environment, since)
    _print_rows(rated(ratings, issues, include_up=args.all))
    if len(ratings) == PAGE:
        print(f"Only the first {PAGE} ratings are listed. Use a smaller --days.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
