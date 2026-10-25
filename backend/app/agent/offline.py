"""Rule-based stand-in for the model, for local development and end-to-end tests.

Enabled only with ``AGENT_OFFLINE=1``. It drives the real loop and the real tools
with a few regular expressions so the conversation UI can be exercised without an
API key. It is not a product feature and is never used in production.
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from itertools import count

from app.agent.model import Final, ModelTurn, StreamEvent, TextDelta, ToolStart

_ids = count(1)


def _money(text: str) -> float | None:
    match = re.search(r"\$?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|m|million|thousand)?", text, re.I)
    if not match:
        return None
    value = float(match.group(1).replace(",", ""))
    unit = (match.group(2) or "").lower()
    if unit in ("k", "thousand"):
        value *= 1_000
    elif unit in ("m", "million"):
        value *= 1_000_000
    return value


_MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")


def extract_update(text: str) -> dict:
    """Pull scenario values out of a message. Deliberately simple."""
    lowered = text.lower()
    update: dict = {}
    for i, m in enumerate(
        re.finditer(rf"\b({'|'.join(_MONTHS)})[a-z]*,?\s+((?:19|20)\d\d)\b", lowered)
    ):
        prefix = (
            "spouse_"
            if i
            or re.search(
                r"(?:husband|wife|spouse|partner)\S*\s+(?:was\s+)?(?:born\s+)?(?:in\s+)?$",
                lowered[: m.start()],
            )
            else ""
        )
        update[f"{prefix}birth_month"] = _MONTHS.index(m.group(1)) + 1
        update[f"{prefix}birth_year"] = int(m.group(2))
    if "married" in lowered or "jointly" in lowered:
        update["filing_status"] = "married_filing_jointly"
    elif "single" in lowered:
        update["filing_status"] = "single"
    if m := re.search(r"(?:retire|stop working|draw\w*)[^.\d]{0,40}?(?:at|age)\s+(\d{2})", lowered):
        update["retirement_age"] = int(m.group(1))
    if re.search(r"\bno (?:work |current )?income\b|\bnot working\b", lowered):
        update["current_income"] = 0
    for sentence in re.split(r"[.;\n]\s|,\s+", text):
        s = sentence.lower()
        amount = _money(re.sub(r"\b(?:at|age)\s+\d{2}\b", "", sentence))
        if amount is None or amount < 1_000:
            continue
        if "roth" in s:
            update["roth_balance"] = amount
        elif any(k in s for k in ("401", "ira", "traditional", "pre-tax")):
            update["traditional_balance"] = amount
        elif any(k in s for k in ("income", "earn", "make", "salary")):
            update["current_income"] = amount
        elif "spend" in s:
            update["retirement_spending"] = amount
    return update


class OfflineModelClient:
    async def stream(
        self, *, system: str, tools: list[dict], messages: list[dict]
    ) -> AsyncIterator[StreamEvent]:
        content = self._respond(messages)
        for block in content:
            if block["type"] == "text":
                for word in re.findall(r"\S+\s*", block["text"]):
                    yield TextDelta(word)
            else:
                yield ToolStart(block["name"])
        stop = "tool_use" if any(b["type"] == "tool_use" for b in content) else "end_turn"
        yield Final(ModelTurn(content=content, stop_reason=stop, usage={}, model="offline"))

    def _respond(self, messages: list[dict]) -> list[dict]:
        last = messages[-1]
        blocks = last["content"] if isinstance(last["content"], list) else []
        results = [b for b in blocks if b.get("type") == "tool_result"]
        if results:
            return self._after_tools(messages[-2], results)
        scenario = latest_scenario(messages)
        text = " ".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        user_text = text.split("</scenario_state>")[-1].strip().lower()

        if "what-if as my scenario" in user_text and (what_if := latest_what_if(messages)):
            return [_tool("prepare_scenario", {"scenario": what_if})]
        if "what if" in user_text and (m := re.search(r"retire (?:at|by) (\d{2})", user_text)):
            return [
                _tool(
                    "compare_roth_scenarios",
                    {
                        "scenario": scenario,
                        "label": f"Retire at {m.group(1)}",
                        "changes": {"retirement_age": int(m.group(1))},
                    },
                )
            ]
        if re.search(r"\b(run|looks right|go ahead|calculate)\b", user_text):
            return [
                _tool("analyze_roth_conversions", {"scenario": scenario, "user_confirmed": True})
            ]
        for keyword, topic in (
            ("rmd", "rmds"),
            ("required minimum", "rmds"),
            ("aca", "aca-subsidies"),
            ("irmaa", "irmaa"),
            ("how does", "how-the-optimizer-works"),
            ("assum", "assumptions-limitations"),
        ):
            if keyword in user_text:
                return [_tool("explain_methodology", {"topic": topic})]
        update = extract_update(user_text)
        if update:
            return [_tool("prepare_scenario", {"scenario": {**scenario, **update}})]
        return [
            _text(
                "Tell me about your situation: the month and year you were born, filing status, income this year, "
                "your traditional IRA or 401(k) balance, and when you plan to start drawing on it."
            )
        ]

    def _after_tools(self, assistant: dict, results: list[dict]) -> list[dict]:
        calls = {b["id"]: b for b in assistant["content"] if b.get("type") == "tool_use"}
        for result in results:
            call = calls.get(result["tool_use_id"], {})
            data = json.loads(result["content"]) if result["content"].startswith("{") else {}
            name = call.get("name")
            if result.get("is_error"):
                return [_text(f"Something didn't work: {data.get('error', result['content'])}")]
            if name == "prepare_scenario":
                if data.get("ready_to_run"):
                    return [_tool("show", {"kind": "scenario_summary"})]
                missing = ", ".join(m.replace("_", " ") for m in data.get("missing_required", []))
                return [_text(f"Thanks, I've noted that. I still need: {missing}.")]
            if name == "show" and data.get("shown") == "scenario_summary":
                return [_text("Here's your scenario. Check the values and tap Run the numbers.")]
            if name == "analyze_roth_conversions":
                points = data["reasoning"]["summary_points"]
                return [
                    _text(f"{points['what_to_convert']}. {points['why_this_amount']}."),
                    _tool(
                        "show",
                        {
                            "kind": "suggestions",
                            "suggestions": ["What if I retire at 60?", "How do RMDs affect this?"],
                        },
                    ),
                ]
            if name == "compare_roth_scenarios":
                diff = data["estimated_lifetime_tax_savings"]["difference"]
                direction = "raises" if diff >= 0 else "lowers"
                return [
                    _text(
                        f"The analysis shows that {data['label'].lower()} {direction} estimated "
                        f"lifetime tax savings by ${abs(diff):,.0f} in today's dollars."
                    )
                ]
            if name == "explain_methodology":
                paragraphs = [p for p in data["text"].split("\n\n") if not p.startswith("#")]
                return [_text(paragraphs[0])]
        return [_text("Anything else you'd like to explore?")]


def latest_scenario(messages: list[dict]) -> dict:
    """The most recent scenario in the conversation: from a tool result or <scenario_state>."""
    for message in reversed(messages):
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in reversed(content):
            text = block.get("content") if block.get("type") == "tool_result" else block.get("text")
            if not isinstance(text, str):
                continue
            text = text.removeprefix("<scenario_state>").removesuffix("</scenario_state>").strip()
            try:
                data = json.loads(text)
            except ValueError:
                continue
            if isinstance(data, dict) and isinstance(data.get("scenario"), dict):
                return data["scenario"]
    return {}


def latest_what_if(messages: list[dict]) -> dict | None:
    """The `what_if_scenario` of the most recent comparison, if any."""
    for message in reversed(messages):
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for block in reversed(content):
            text = block.get("content") if block.get("type") == "tool_result" else None
            if not isinstance(text, str):
                continue
            try:
                data = json.loads(text)
            except ValueError:
                continue
            if isinstance(data, dict) and isinstance(data.get("what_if_scenario"), dict):
                return data["what_if_scenario"]
    return None


def _tool(name: str, payload: dict) -> dict:
    return {"type": "tool_use", "id": f"toolu_offline_{next(_ids)}", "name": name, "input": payload}


def _text(text: str) -> dict:
    return {"type": "text", "text": text}
