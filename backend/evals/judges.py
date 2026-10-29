"""LLM judges for the agent evals, defined in evals/judges/*.yaml.

Each judge reads a case's conversation and its last reply and returns pass or fail
with a one-sentence reason. A case lists the judges that apply to it under "judge"
in agent_cases.json. The YAML files are the source of truth: the runner calls the
model here and, when Langfuse tracing is on, stores each verdict as a score on the
case's trace, named after the judge.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import yaml

from app.agent.limits import estimate_cost
from app.agent.model import api_key

JUDGES_DIR = Path(__file__).resolve().parent / "judges"

# The verdict comes back as JSON in this shape (structured outputs).
_VERDICT_FORMAT = {
    "type": "json_schema",
    "schema": {
        "type": "object",
        "properties": {
            "reason": {"type": "string", "description": "One sentence on why."},
            "passed": {"type": "boolean"},
        },
        "required": ["reason", "passed"],
        "additionalProperties": False,
    },
}


@dataclass
class Judge:
    name: str
    description: str
    model: str
    prompt: str


@dataclass
class Verdict:
    judge: str
    passed: bool
    reason: str
    cost_usd: float


def load_judges(directory: Path = JUDGES_DIR) -> dict[str, Judge]:
    judges = {}
    for path in sorted(directory.glob("*.yaml")):
        data = yaml.safe_load(path.read_text())
        judge = Judge(**{key: data[key] for key in ("name", "description", "model", "prompt")})
        judges[judge.name] = judge
    return judges


def format_conversation(transcript: list[dict]) -> tuple[str, str]:
    """The conversation up to the last user message, and the last reply."""
    lines = []
    for i, turn in enumerate(transcript):
        lines.append(f"User: {turn['user']}")
        if i < len(transcript) - 1:
            lines.append(f"Assistant: {turn['assistant']}")
    return "\n\n".join(lines), transcript[-1]["assistant"]


class JudgeClient:
    def __init__(self) -> None:
        import anthropic

        self._client = anthropic.AsyncAnthropic(api_key=api_key(), timeout=60.0, max_retries=2)

    async def judge(self, judge: Judge, transcript: list[dict]) -> Verdict:
        conversation, reply = format_conversation(transcript)
        prompt = judge.prompt.replace("{conversation}", conversation).replace("{reply}", reply)
        response = await self._client.messages.create(
            model=judge.model,
            max_tokens=4000,
            output_config={"effort": "medium", "format": _VERDICT_FORMAT},
            messages=[{"role": "user", "content": prompt}],
        )
        text = next(b.text for b in response.content if b.type == "text")
        verdict = json.loads(text)
        return Verdict(
            judge=judge.name,
            passed=bool(verdict["passed"]),
            reason=str(verdict["reason"]),
            cost_usd=round(estimate_cost(judge.model, response.usage), 5),
        )
