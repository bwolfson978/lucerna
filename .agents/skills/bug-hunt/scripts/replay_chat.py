#!/usr/bin/env python3
"""Replay conversations against the connector's own instructions and tools.

Stands in for a chat app when no browser is reachable, and gives a count over several
runs where one live chat gives one sample. A model gets this checkout's MCP server
instructions and tool list, the tools run in this process, and each user turn is sent
in order. It shows what the model does with our tool contract: which tools it calls,
with what arguments, and what it says.

It is not a live chat: there is no host system prompt, no on-demand tool loading and
no cards, and the server is this checkout, not production. Label anything learned here
as "replayed", and confirm a finding that matters in a real chat.

    export LUCERNA_ANTHROPIC_API_KEY=...   # the evals key; see the skill for Doppler
    python .agents/skills/bug-hunt/scripts/replay_chat.py cases.json
    python .agents/skills/bug-hunt/scripts/replay_chat.py cases.json --repeat 3 --out runs/

cases.json: [{"id": "plain-question", "turns": ["first message", "a follow-up"]}, ...]
With --out, each run's full transcript is written there as JSON for reading.
Every run costs model tokens (a few cents each on the default model): keep --repeat small.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Paths on the command line are relative to where the script was started; the backend
# reads its settings from its own folder.
STARTED_IN = Path.cwd()
BACKEND = Path(__file__).resolve().parents[4] / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
# Replays run several conversations at once; the default of two analyses at a time
# would answer some of them "busy".
os.environ.setdefault("MCP_MAX_CONCURRENT_ANALYSES", "8")

import anthropic  # noqa: E402

from app.agent.model import api_key  # noqa: E402
from app.mcp import server  # noqa: E402

SYSTEM = (
    "You are a helpful assistant in a chat app. The user has connected this tool server.\n\n"
    '<server name="Roth Conversions Optimizer">\n{instructions}\n</server>'
)
MAX_STEPS_PER_TURN = 8
ANALYSIS_TOOLS = ("analyze_roth_conversions", "compare_roth_scenarios")


async def api_tools() -> list[dict]:
    return [
        {"name": t.name, "description": t.description or "", "input_schema": t.inputSchema}
        for t in await server.mcp.list_tools()
    ]


async def call_tool(name: str, args: dict) -> tuple[str, bool]:
    try:
        out = await server.mcp.call_tool(name, args)
    except Exception as err:  # schema validation and unknown tools
        return json.dumps({"error": str(err)[:800]}), True
    if hasattr(out, "content"):
        return "".join(getattr(c, "text", "") for c in out.content), bool(out.isError)
    content = out[0] if isinstance(out, tuple) else out
    return "".join(getattr(c, "text", "") for c in content), False


def call_label(name: str, args: dict) -> str:
    if name == "analyze_roth_conversions":
        return f"{name}(user_confirmed={args.get('user_confirmed')})"
    if name == "compare_roth_scenarios":
        return f"{name}(changes={json.dumps(args.get('changes', {}))[:120]})"
    return name


async def run_case(client, model: str, tools: list[dict], case: dict) -> dict:
    system = SYSTEM.format(instructions=server.INSTRUCTIONS)
    messages: list[dict] = []
    turns = []
    for user_text in case["turns"]:
        messages.append({"role": "user", "content": user_text})
        calls, reply = [], "(step limit reached)"
        for _ in range(MAX_STEPS_PER_TURN):
            response = await client.messages.create(
                model=model, max_tokens=4000, system=system, tools=tools, messages=messages
            )
            messages.append(
                {"role": "assistant", "content": [b.model_dump() for b in response.content]}
            )
            uses = [b for b in response.content if b.type == "tool_use"]
            if not uses:
                reply = "\n".join(b.text for b in response.content if b.type == "text")
                break
            results = []
            for use in uses:
                text, is_error = await call_tool(use.name, use.input)
                calls.append(
                    {"tool": use.name, "label": call_label(use.name, use.input), "error": is_error}
                )
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": use.id,
                        "content": text,
                        "is_error": is_error,
                    }
                )
            messages.append({"role": "user", "content": results})
        turns.append({"user": user_text, "calls": calls, "reply": reply})
    return {"id": case["id"], "model": model, "turns": turns, "messages": messages}


def print_run(run: dict, number: int) -> None:
    print(f"== {run['id']} (run {number})")
    for i, turn in enumerate(run["turns"], start=1):
        labels = [c["label"] + (" [error]" if c["error"] else "") for c in turn["calls"]]
        print(f"  turn {i}: {' -> '.join(labels) or 'no tool calls'}")
        print(f"    reply: {' '.join(turn['reply'].split())[:220]}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("cases", help="JSON file: a list of {id, turns}")
    parser.add_argument("--model", default="claude-opus-5-5")
    parser.add_argument("--repeat", type=int, default=2, help="runs per case (default 2)")
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--out", help="directory for full transcripts")
    args = parser.parse_args()

    key = api_key()
    if not key:
        sys.exit("No model key: set LUCERNA_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY).")
    cases = json.loads((STARTED_IN / args.cases).read_text())
    client = anthropic.AsyncAnthropic(api_key=key, timeout=180.0, max_retries=2)
    tools = await api_tools()
    slots = asyncio.Semaphore(args.concurrency)

    async def one(case: dict) -> dict:
        async with slots:
            return await run_case(client, args.model, tools, case)

    jobs = [one(case) for case in cases for _ in range(args.repeat)]
    runs = await asyncio.gather(*jobs)

    out = STARTED_IN / args.out if args.out else None
    if out:
        out.mkdir(parents=True, exist_ok=True)
    seen: dict[str, int] = {}
    ran_first_turn = 0
    for run in runs:
        seen[run["id"]] = number = seen.get(run["id"], 0) + 1
        print_run(run, number)
        first_calls = [c["tool"] for c in run["turns"][0]["calls"]]
        ran_first_turn += any(tool in ANALYSIS_TOOLS for tool in first_calls)
        if out:
            (out / f"{run['id']}-{number}.json").write_text(json.dumps(run, indent=1))
    print(
        f"\nreplayed, not live: {args.model}, {len(runs)} runs. "
        f"An analysis ran in the first turn in {ran_first_turn} of {len(runs)}."
    )


if __name__ == "__main__":
    asyncio.run(main())
