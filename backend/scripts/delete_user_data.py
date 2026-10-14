"""Delete everything we hold about a person, for emailed deletion requests and clean-ups.

Looks the person up by email (and/or Clerk user id) in Clerk, the saved-scenarios
database and PostHog, prints what it found, and deletes it only with --yes.

Usage (from backend/, with the production values of the env vars below):
    python -m scripts.delete_user_data --email someone@example.com
    python -m scripts.delete_user_data --email someone@example.com --yes
    # Scenarios or analytics left behind by an account that is already gone:
    python -m scripts.delete_user_data --user-id user_2abc --yes

Env: CLERK_SECRET_KEY, DATABASE_URL, POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID
(and optionally POSTHOG_API_HOST). Anything not set is skipped and reported.
With the Railway CLI linked: railway run python -m scripts.delete_user_data ...
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from app.db import session
from app.privacy import erasure


def describe(findings: erasure.Findings) -> list[str]:
    lines = []
    for user in findings.clerk_users:
        lines.append(f"Clerk account {user.id} ({', '.join(user.emails)})")
    for user_id, count in findings.scenarios.items():
        lines.append(f"{count} saved scenario(s) for {user_id}")
    for person in findings.posthog_persons:
        lines.append(
            f"PostHog person {person.uuid} with its events and replays "
            f"({len(person.distinct_ids)} distinct id(s))"
        )
    if findings.unlinked_feedback:
        lines.append(
            f"{len(findings.unlinked_feedback)} feedback report(s) with this email and no "
            "PostHog person (can't be deleted by API, see below)"
        )
    return lines


def manual_steps(findings: erasure.Findings) -> list[str]:
    if not findings.unlinked_feedback:
        return []
    steps = [
        "These feedback reports were sent without an account. PostHog has no API to "
        "delete single events, so they age out with its 12-month retention. To remove "
        "them sooner, ask PostHog support to delete these event ids:"
    ]
    steps += [
        f"  {e.uuid}  {e.timestamp}  {e.survey}  ({e.distinct_id})"
        for e in findings.unlinked_feedback
    ]
    return steps


async def run(emails: list[str], user_ids: list[str], execute: bool) -> int:
    config = erasure.Config.from_env()
    await session.init_db()
    try:
        findings = await erasure.find(emails, user_ids, config=config)
        for note in findings.skipped:
            print(f"Skipped: {note}")
        if findings.is_empty():
            print("Nothing found.")
            return 0

        print("Found:")
        for line in describe(findings):
            print(f"  - {line}")

        if not execute:
            print("\nDry run. Re-run with --yes to delete all of the above.")
            for line in manual_steps(findings):
                print(line)
            return 0

        erased = await erasure.erase(findings, config=config)
        print(
            f"\nDeleted {erased.scenarios} saved scenario(s), {erased.clerk_users} Clerk "
            f"account(s), and queued deletion of {erased.posthog_persons} PostHog person(s) "
            "with their events and replays (PostHog finishes this in the background)."
        )
        for line in manual_steps(findings):
            print(line)
        for error in erased.errors:
            print(f"Error: {error}", file=sys.stderr)
        return 1 if erased.errors else 0
    finally:
        await session.close_db()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--email", action="append", default=[], help="Email address (repeatable)")
    parser.add_argument("--user-id", action="append", default=[], help="Clerk user id (repeatable)")
    parser.add_argument("--yes", action="store_true", help="Delete (default is a dry run)")
    args = parser.parse_args(argv)
    if not args.email and not args.user_id:
        parser.error("give at least one --email or --user-id")
    return asyncio.run(run(args.email, args.user_id, args.yes))


if __name__ == "__main__":
    sys.exit(main())
