"""Copy the LLM-judged cases from agent_cases.json into the Langfuse "agent-evals" dataset.

Usage (from backend/, with LANGFUSE_TRACING and the Langfuse keys set):
    python -m evals.sync_langfuse            # upsert, then list what changed
    python -m evals.sync_langfuse --dry-run  # list what would change

agent_cases.json is the source of truth; the dataset is a copy that experiments run
against, so edit cases here, never in Langfuse. Each case with a "judge" list becomes
the item "agent-evals-<case id>" (input: the user turns; metadata: case id, category,
judges). Items whose case was removed or is no longer judged are archived, which keeps
past runs readable. Langfuse versions the dataset on every change.
"""

from __future__ import annotations

import argparse
import json
import sys

from app.agent import tracing
from evals.run_agent_evals import CASES_FILE, DATASET

DESCRIPTION = "LLM-judged agent eval cases. Copied from backend/evals/agent_cases.json; edit there."


def item_id(case_id: str) -> str:
    return f"{DATASET}-{case_id}"


def wanted_items(cases: list[dict]) -> dict[str, dict]:
    return {
        item_id(c["id"]): {
            "input": c["turns"],
            "metadata": {"case_id": c["id"], "category": c["category"], "judges": c["judge"]},
        }
        for c in cases
        if c.get("judge")
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    langfuse = tracing.client()
    if langfuse is None:
        print("Langfuse is off: set LANGFUSE_TRACING=true and both LANGFUSE keys.")
        return 1

    wanted = wanted_items(json.loads(CASES_FILE.read_text())["cases"])
    try:
        current = {i.id: i for i in langfuse.get_dataset(DATASET).items}
    except Exception:  # noqa: BLE001
        current = {}
        if not args.dry_run:
            langfuse.create_dataset(name=DATASET, description=DESCRIPTION)

    changed = 0
    for key, fields in wanted.items():
        have = current.get(key)
        unchanged = have and have.input == fields["input"] and have.metadata == fields["metadata"]
        if unchanged and str(have.status).upper().endswith("ACTIVE"):
            continue
        print(("update  " if have else "add     ") + key)
        changed += 1
        if not args.dry_run:
            langfuse.create_dataset_item(dataset_name=DATASET, id=key, status="ACTIVE", **fields)
    for key, have in current.items():
        if key not in wanted and not str(have.status).upper().endswith("ARCHIVED"):
            print(f"archive {key}")
            changed += 1
            if not args.dry_run:
                langfuse.create_dataset_item(
                    dataset_name=DATASET,
                    id=key,
                    input=have.input,
                    metadata=have.metadata,
                    status="ARCHIVED",
                )
    langfuse.flush()
    print(
        f"{changed} item(s) {'would change' if args.dry_run else 'changed'}; {len(wanted)} active."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
