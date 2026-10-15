"""Find and erase everything Roth Conversions Optimizer holds about one person.

Used by ``scripts/delete_user_data.py`` for emailed deletion requests and clean-ups,
and (the PostHog part only) by ``DELETE /api/account`` after someone deletes their own
account in Account settings (/account).

Where a person's data lives:

- Clerk: the account itself (email, name, sign-in method).
- Postgres: saved scenarios, keyed by Clerk user id.
- PostHog: the person (on the website the distinct id is the Clerk user id), their
  events and session replays, and feedback. Feedback sent while signed out is found by
  the email address typed into the form.

Feedback sent from a chat without signing in has no PostHog person to delete, and
PostHog has no API for deleting single events, so those are reported for manual
follow-up instead of deleted.

Configuration (all optional; a missing service is reported and skipped):
``CLERK_SECRET_KEY``, ``POSTHOG_PERSONAL_API_KEY`` (scopes: person:read, person:write,
query:read), ``POSTHOG_PROJECT_ID`` and ``POSTHOG_API_HOST`` (default
https://us.posthog.com). Saved scenarios need ``DATABASE_URL``.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.db import scenarios as store
from app.tools.feedback import EVENT as FEEDBACK_EVENT
from app.tools.feedback import SURVEYS

logger = logging.getLogger(__name__)

CLERK_API = "https://api.clerk.com/v1"
DEFAULT_POSTHOG_API_HOST = "https://us.posthog.com"
ANONYMOUS_FEEDBACK_PREFIX = "feedback-anon:"


@dataclass(frozen=True)
class Config:
    clerk_secret_key: str = ""
    posthog_api_key: str = ""
    posthog_project_id: str = ""
    posthog_api_host: str = DEFAULT_POSTHOG_API_HOST

    @classmethod
    def from_env(cls) -> Config:
        def env(name: str) -> str:
            return os.environ.get(name, "").strip()

        return cls(
            clerk_secret_key=env("CLERK_SECRET_KEY"),
            posthog_api_key=env("POSTHOG_PERSONAL_API_KEY"),
            posthog_project_id=env("POSTHOG_PROJECT_ID"),
            posthog_api_host=(env("POSTHOG_API_HOST") or DEFAULT_POSTHOG_API_HOST).rstrip("/"),
        )

    @property
    def clerk_enabled(self) -> bool:
        return bool(self.clerk_secret_key)

    @property
    def posthog_enabled(self) -> bool:
        return bool(self.posthog_api_key and self.posthog_project_id)


@dataclass(frozen=True)
class ClerkUser:
    id: str
    emails: tuple[str, ...]


@dataclass(frozen=True)
class PosthogPerson:
    uuid: str
    distinct_ids: tuple[str, ...]


@dataclass(frozen=True)
class FeedbackEvent:
    uuid: str
    distinct_id: str
    timestamp: str
    survey: str


@dataclass
class Findings:
    """What we hold for the people asked about. Nothing here has been deleted yet."""

    emails: list[str] = field(default_factory=list)
    clerk_users: list[ClerkUser] = field(default_factory=list)
    # Clerk user id -> saved scenario count. Includes ids given directly, so scenarios
    # left behind by an already-deleted account can be cleaned up too.
    scenarios: dict[str, int] = field(default_factory=dict)
    posthog_persons: list[PosthogPerson] = field(default_factory=list)
    # Feedback events carrying one of the emails that no PostHog person owns.
    unlinked_feedback: list[FeedbackEvent] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    @property
    def user_ids(self) -> list[str]:
        return list(self.scenarios)

    def is_empty(self) -> bool:
        return not (
            self.clerk_users
            or any(self.scenarios.values())
            or self.posthog_persons
            or self.unlinked_feedback
        )


# ---------------------------------------------------------------------------
# Clerk
# ---------------------------------------------------------------------------


def _clerk_headers(config: Config) -> dict[str, str]:
    return {"Authorization": f"Bearer {config.clerk_secret_key}"}


async def find_clerk_users(http: httpx.AsyncClient, config: Config, email: str) -> list[ClerkUser]:
    response = await http.get(
        f"{CLERK_API}/users",
        params={"email_address": email},
        headers=_clerk_headers(config),
    )
    response.raise_for_status()
    return [
        ClerkUser(
            id=user["id"],
            emails=tuple(e["email_address"] for e in user.get("email_addresses", [])),
        )
        for user in response.json()
    ]


async def delete_clerk_user(http: httpx.AsyncClient, config: Config, user_id: str) -> bool:
    """Delete a Clerk user. False when it was already gone."""
    response = await http.delete(f"{CLERK_API}/users/{user_id}", headers=_clerk_headers(config))
    if response.status_code == 404:
        return False
    response.raise_for_status()
    return True


# ---------------------------------------------------------------------------
# PostHog
# ---------------------------------------------------------------------------


def _posthog_url(config: Config, path: str) -> str:
    return f"{config.posthog_api_host}/api/projects/{config.posthog_project_id}/{path}"


def _posthog_headers(config: Config) -> dict[str, str]:
    return {"Authorization": f"Bearer {config.posthog_api_key}"}


async def find_posthog_persons(
    http: httpx.AsyncClient, config: Config, **filters: str
) -> list[PosthogPerson]:
    """Persons matching one filter of the persons list API (``distinct_id`` or ``email``)."""
    response = await http.get(
        _posthog_url(config, "persons/"), params=filters, headers=_posthog_headers(config)
    )
    response.raise_for_status()
    return [
        PosthogPerson(uuid=p["uuid"], distinct_ids=tuple(p.get("distinct_ids", [])))
        for p in response.json().get("results", [])
    ]


async def find_feedback_by_email(
    http: httpx.AsyncClient, config: Config, email: str
) -> list[FeedbackEvent]:
    """Feedback and problem reports where someone left this email for a reply."""
    columns = [f"properties.`$survey_response_{s.email}`" for s in SURVEYS.values()]
    matches = " OR ".join(f"lower({column}) = {{email}}" for column in columns)
    query = (
        "SELECT uuid, distinct_id, timestamp, properties.`$survey_name` FROM events "
        f"WHERE event = {{event}} AND ({matches}) ORDER BY timestamp"
    )
    response = await http.post(
        _posthog_url(config, "query/"),
        json={
            "query": {
                "kind": "HogQLQuery",
                "query": query,
                "values": {"email": email.lower(), "event": FEEDBACK_EVENT},
            }
        },
        headers=_posthog_headers(config),
    )
    response.raise_for_status()
    return [
        FeedbackEvent(uuid=str(row[0]), distinct_id=row[1], timestamp=str(row[2]), survey=row[3])
        for row in response.json().get("results", [])
    ]


async def delete_posthog_persons(
    http: httpx.AsyncClient,
    config: Config,
    *,
    uuids: list[str] | None = None,
    distinct_ids: list[str] | None = None,
) -> None:
    """Queue deletion of persons with their events and session replays.

    PostHog processes the deletion in the background (usually within a day).
    """
    body: dict[str, Any] = {"delete_events": True, "delete_recordings": True}
    if uuids:
        body["ids"] = uuids
    if distinct_ids:
        body["distinct_ids"] = distinct_ids
    response = await http.post(
        _posthog_url(config, "persons/bulk_delete/"), json=body, headers=_posthog_headers(config)
    )
    response.raise_for_status()


async def forget_web_person(user_id: str, *, http: httpx.AsyncClient | None = None) -> None:
    """Best effort, after self-serve account deletion: delete the user's PostHog person.

    Never raises; the account is already gone and a support request can finish the job.
    """
    config = Config.from_env()
    if not config.posthog_enabled:
        return
    try:
        async with _client(http) as client:
            await delete_posthog_persons(client, config, distinct_ids=[user_id])
    except Exception:  # noqa: BLE001
        logger.warning("Could not delete PostHog person for a deleted account", exc_info=True)


# ---------------------------------------------------------------------------
# Find, then erase
# ---------------------------------------------------------------------------


class _client:
    """Use the given client, or open (and close) a new one."""

    def __init__(self, http: httpx.AsyncClient | None):
        self._given = http
        self._own: httpx.AsyncClient | None = None

    async def __aenter__(self) -> httpx.AsyncClient:
        if self._given is not None:
            return self._given
        self._own = httpx.AsyncClient(timeout=20)
        return self._own

    async def __aexit__(self, *exc: object) -> None:
        if self._own is not None:
            await self._own.aclose()


async def find(
    emails: list[str],
    user_ids: list[str] | None = None,
    *,
    config: Config,
    http: httpx.AsyncClient | None = None,
) -> Findings:
    """Look up what we hold for these emails and Clerk user ids. Read-only."""
    findings = Findings(emails=[e.strip().lower() for e in emails if e.strip()])
    ids: list[str] = list(dict.fromkeys(user_ids or []))

    async with _client(http) as client:
        if config.clerk_enabled:
            for email in findings.emails:
                for user in await find_clerk_users(client, config, email):
                    if user.id not in {u.id for u in findings.clerk_users}:
                        findings.clerk_users.append(user)
            ids += [u.id for u in findings.clerk_users if u.id not in ids]
        elif findings.emails:
            findings.skipped.append("Clerk: CLERK_SECRET_KEY not set, accounts not looked up")

        for user_id in ids:
            try:
                findings.scenarios[user_id] = await store.count_all(user_id)
            except store.StorageUnavailable:
                findings.skipped.append("Saved scenarios: DATABASE_URL not set")
                findings.scenarios = dict.fromkeys(ids, 0)
                break

        if config.posthog_enabled:
            persons: dict[str, PosthogPerson] = {}

            async def add(**filters: str) -> None:
                for person in await find_posthog_persons(client, config, **filters):
                    persons.setdefault(person.uuid, person)

            for user_id in ids:
                await add(distinct_id=user_id)
            for email in findings.emails:
                await add(email=email)
                for event in await find_feedback_by_email(client, config, email):
                    owned = any(event.distinct_id in p.distinct_ids for p in persons.values())
                    if not owned and not event.distinct_id.startswith(ANONYMOUS_FEEDBACK_PREFIX):
                        # Feedback from the website while signed out: the visitor may
                        # have a person of their own.
                        await add(distinct_id=event.distinct_id)
                        owned = any(event.distinct_id in p.distinct_ids for p in persons.values())
                    if not owned:
                        findings.unlinked_feedback.append(event)
            findings.posthog_persons = list(persons.values())
        else:
            findings.skipped.append(
                "PostHog: POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID not set, "
                "analytics, replays and feedback not looked up"
            )
    return findings


@dataclass
class Erased:
    scenarios: int = 0
    posthog_persons: int = 0
    clerk_users: int = 0
    errors: list[str] = field(default_factory=list)


async def erase(
    findings: Findings, *, config: Config, http: httpx.AsyncClient | None = None
) -> Erased:
    """Delete what ``find`` found. Each service is attempted even if another fails.

    The Clerk account goes last, so a failure earlier leaves the account in place and
    the request can simply be run again.
    """
    erased = Erased()
    async with _client(http) as client:
        for user_id, count in findings.scenarios.items():
            if not count:
                continue
            try:
                erased.scenarios += await store.delete_all(user_id)
            except Exception as exc:  # noqa: BLE001
                erased.errors.append(f"Saved scenarios for {user_id}: {exc}")

        if findings.posthog_persons:
            try:
                await delete_posthog_persons(
                    client, config, uuids=[p.uuid for p in findings.posthog_persons]
                )
                erased.posthog_persons = len(findings.posthog_persons)
            except Exception as exc:  # noqa: BLE001
                erased.errors.append(f"PostHog persons: {exc}")

        if not erased.errors:
            for user in findings.clerk_users:
                try:
                    if await delete_clerk_user(client, config, user.id):
                        erased.clerk_users += 1
                except Exception as exc:  # noqa: BLE001
                    erased.errors.append(f"Clerk user {user.id}: {exc}")
        elif findings.clerk_users:
            erased.errors.append("Clerk accounts kept so the request can be retried")
    return erased
