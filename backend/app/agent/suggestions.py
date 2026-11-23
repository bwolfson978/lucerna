"""Follow-up questions offered under a reply (the tappable chips).

The main model's part of a turn is tool calls and then the answer. Once the answer is
written, the loop asks a small, fast model (``ModelClient.task``) for a few questions the
person might want to ask next and sends them to the browser as a ``suggestions`` part. The
main model never sees or manages the chips.

Chips are a convenience. A timeout, an outage or an unusable reply means no chips for
that reply, never a failed turn.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass

from app import error_tracking
from app.agent.model import ModelClient, ModelUnavailable

logger = logging.getLogger(__name__)

MAX_QUESTIONS = 4
MAX_QUESTION_CHARS = 80
# How many of the person's latest messages the task model reads, to avoid repeats.
RECENT_MESSAGES = 6

# Tools whose results give the person something to ask follow-up questions about.
RESULT_TOOLS = {"analyze_roth_conversions", "compare_roth_scenarios"}

SYSTEM = """\
You write the follow-up questions shown as tappable chips under a reply in Roth Conversions \
Optimizer, a planning tool that shows how Roth conversions could affect a person's lifetime \
taxes. Tapping a chip sends it to the assistant as the person's next message, so each chip \
is a question in the person's own voice.

You are given the person's scenario, the messages they have sent recently and the \
assistant's latest reply. Propose two or three questions this person would plausibly want \
to ask next.

What the assistant can answer:
- What-ifs that change one thing in the scenario: retirement age, income, spending in \
retirement, when Social Security or a pension starts, a move to another state, how long the \
plan runs, the assumed investment return. For example: "What if I retire at 62?"
- Why the result looks the way it does: why it converts that much and not more, what holds \
it back, what happens in a particular year.
- How the analysis treats required minimum distributions, Medicare premium surcharges \
(IRMAA), ACA subsidies, state taxes and early withdrawals, and what it assumes or leaves out.
It does not give advice and does not cover estate planning, heirs or specific investments, \
so leave those out.

Rules:
- Ground each question in this person's scenario and in the reply: build on their own \
ages, amounts and situation and on what the reply just raised.
- Don't repeat or rephrase something they already asked, or ask what the reply already \
answers.
- One short sentence each, under 60 characters, in plain English. No em dashes.
- Ask what the analysis shows ("What if...", "How does...", "Why..."), never what the \
person should do.
- If the reply ends by asking the person for information or for a decision, return an \
empty list: they need to answer it first."""

SCHEMA = {
    "type": "object",
    "properties": {"questions": {"type": "array", "items": {"type": "string"}}},
    "required": ["questions"],
    "additionalProperties": False,
}

# Changes when the instructions do, so cached conversations (the demo) are regenerated.
VERSION = hashlib.sha256((SYSTEM + json.dumps(SCHEMA)).encode()).hexdigest()[:12]


@dataclass
class Offer:
    """The questions to show, and what asking for them cost."""

    questions: list[str]
    model: str
    usage: dict


def fit(history: list[dict], turn: list[dict]) -> bool:
    """Whether the reply that ends ``turn`` should carry follow-up questions.

    They follow answers about a result. A turn that changed the scenario ends with the
    person checking it (or supplying what is missing), so it gets none.
    """
    return (
        bool(_reply(turn))
        and "prepare_scenario" not in _tools_called(turn)
        and _has_result([*history, *turn])
    )


async def write(
    client: ModelClient, *, scenario: dict, history: list[dict], turn: list[dict]
) -> Offer | None:
    """Ask the task model for follow-up questions to the reply that ends ``turn``."""
    try:
        reply = await client.task(
            system=SYSTEM, prompt=_prompt(scenario, history, turn), schema=SCHEMA
        )
    except ModelUnavailable:
        return None
    except Exception as exc:  # noqa: BLE001 - chips must never fail a turn
        logger.exception("Could not write follow-up questions")
        error_tracking.capture_exception(exc, source="agent_follow_ups")
        return None
    return Offer(
        questions=_usable(reply.data.get("questions")), model=reply.model, usage=reply.usage
    )


def _prompt(scenario: dict, history: list[dict], turn: list[dict]) -> str:
    sent = "\n".join(f"- {text}" for text in _sent_by_user([*history, *turn])[-RECENT_MESSAGES:])
    return (
        f"<scenario>\n{json.dumps(scenario, separators=(',', ':'))}\n</scenario>\n\n"
        f"<recent_messages_from_the_person>\n{sent}\n</recent_messages_from_the_person>\n\n"
        f"<assistant_reply>\n{_reply(turn)}\n</assistant_reply>"
    )


def _usable(questions: object) -> list[str]:
    """Keep the questions that fit a chip: non-empty, short, no em dash, no duplicates."""
    kept: list[str] = []
    for question in questions if isinstance(questions, list) else []:
        text = question.strip() if isinstance(question, str) else ""
        if text and len(text) <= MAX_QUESTION_CHARS and "—" not in text and text not in kept:
            kept.append(text)
    return kept[:MAX_QUESTIONS]


# --------------------------------------------------------------------------
# Reading the conversation (Messages API format)
# --------------------------------------------------------------------------


def _blocks(message: dict, kind: str) -> list[dict]:
    content = message.get("content")
    if isinstance(content, str):
        content = [{"type": "text", "text": content}]
    return [b for b in content or [] if isinstance(b, dict) and b.get("type") == kind]


def _reply(turn: list[dict]) -> str:
    """The text of the assistant message that ends the turn."""
    last = turn[-1] if turn else {}
    if last.get("role") != "assistant":
        return ""
    return "".join(b.get("text", "") for b in _blocks(last, "text")).strip()


def _tools_called(messages: list[dict]) -> set[str]:
    return {b["name"] for m in messages if m["role"] == "assistant" for b in _blocks(m, "tool_use")}


def _has_result(messages: list[dict]) -> bool:
    """Whether an analysis or comparison has succeeded in this conversation."""
    asked = {
        b["id"]
        for m in messages
        if m["role"] == "assistant"
        for b in _blocks(m, "tool_use")
        if b["name"] in RESULT_TOOLS
    }
    return any(
        b.get("tool_use_id") in asked and not b.get("is_error")
        for m in messages
        if m["role"] == "user"
        for b in _blocks(m, "tool_result")
    )


def _sent_by_user(messages: list[dict]) -> list[str]:
    """The person's own messages, without the scenario block the app adds in front."""
    return [
        text
        for m in messages
        if m["role"] == "user"
        for b in _blocks(m, "text")
        if (text := b.get("text", "").strip()) and not text.startswith("<scenario_state>")
    ]
