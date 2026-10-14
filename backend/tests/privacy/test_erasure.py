"""Finding and erasing a person's data across Clerk, saved scenarios and PostHog."""

import json

import httpx
import pytest

from app.privacy import erasure
from scripts import delete_user_data

CONFIG = erasure.Config(
    clerk_secret_key="sk_test",
    posthog_api_key="phx_test",
    posthog_project_id="123",
)
PH = "https://us.posthog.com/api/projects/123"


class FakeServices:
    """Clerk and PostHog APIs, recording every request."""

    def __init__(self, *, clerk_users=None, persons=None, feedback=None):
        self.clerk_users = clerk_users or []
        # filter value (distinct id or email) -> list of persons
        self.persons = persons or {}
        self.feedback = feedback or []
        self.requests: list[tuple[str, str, dict]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url.copy_with(query=None))
        body = json.loads(request.content) if request.content else {}
        self.requests.append((request.method, url, body))
        params = dict(request.url.params)
        if url == f"{erasure.CLERK_API}/users" and request.method == "GET":
            assert request.headers["authorization"] == "Bearer sk_test"
            email = params["email_address"]
            return httpx.Response(
                200,
                json=[
                    {"id": uid, "email_addresses": [{"email_address": e}]}
                    for uid, e in self.clerk_users
                    if e == email
                ],
            )
        if url.startswith(f"{erasure.CLERK_API}/users/") and request.method == "DELETE":
            return httpx.Response(200, json={"deleted": True})
        if url == f"{PH}/persons/":
            assert request.headers["authorization"] == "Bearer phx_test"
            key = params.get("distinct_id") or params.get("email")
            return httpx.Response(200, json={"results": self.persons.get(key, [])})
        if url == f"{PH}/query/":
            return httpx.Response(200, json={"results": self.feedback})
        if url == f"{PH}/persons/bulk_delete/":
            return httpx.Response(202)
        return httpx.Response(404)

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))


@pytest.fixture
def scenarios(monkeypatch):
    saved = {"user_a": 2}
    deleted = []

    async def count_all(user_id):
        return saved.get(user_id, 0)

    async def delete_all(user_id):
        deleted.append(user_id)
        return saved.pop(user_id, 0)

    monkeypatch.setattr(erasure.store, "count_all", count_all)
    monkeypatch.setattr(erasure.store, "delete_all", delete_all)
    return deleted


PERSON_A = {"uuid": "p-a", "distinct_ids": ["user_a", "anon-1"]}
PERSON_VISITOR = {"uuid": "p-v", "distinct_ids": ["anon-9"]}


async def test_finds_account_scenarios_analytics_and_feedback(scenarios):
    services = FakeServices(
        clerk_users=[("user_a", "a@example.com")],
        persons={"user_a": [PERSON_A], "a@example.com": [PERSON_A], "anon-9": [PERSON_VISITOR]},
        feedback=[
            ["e1", "user_a", "2026-10-01", "Feedback"],
            ["e2", "anon-9", "2026-10-02", "Report a problem"],
            ["e3", "feedback-anon:s1", "2026-10-03", "Feedback"],
        ],
    )
    async with services.client() as http:
        findings = await erasure.find([" A@example.com "], config=CONFIG, http=http)

    assert [u.id for u in findings.clerk_users] == ["user_a"]
    assert findings.scenarios == {"user_a": 2}
    assert [p.uuid for p in findings.posthog_persons] == ["p-a", "p-v"]
    # Only the chat report sent without an account is left over.
    assert [e.uuid for e in findings.unlinked_feedback] == ["e3"]
    assert findings.skipped == []
    query = next(body for _, url, body in services.requests if url.endswith("/query/"))
    assert query["query"]["values"]["email"] == "a@example.com"
    assert "{email}" in query["query"]["query"]


async def test_erase_deletes_everything_and_the_account_last(scenarios):
    services = FakeServices(
        clerk_users=[("user_a", "a@example.com")], persons={"user_a": [PERSON_A]}
    )
    async with services.client() as http:
        findings = await erasure.find(["a@example.com"], config=CONFIG, http=http)
        services.requests.clear()
        erased = await erasure.erase(findings, config=CONFIG, http=http)

    assert scenarios == ["user_a"]
    assert (erased.scenarios, erased.posthog_persons, erased.clerk_users) == (2, 1, 1)
    assert erased.errors == []
    (bulk, clerk) = services.requests
    assert bulk[1] == f"{PH}/persons/bulk_delete/"
    assert bulk[2] == {"delete_events": True, "delete_recordings": True, "ids": ["p-a"]}
    assert clerk[:2] == ("DELETE", f"{erasure.CLERK_API}/users/user_a")


async def test_keeps_the_account_when_another_deletion_fails(scenarios):
    services = FakeServices(
        clerk_users=[("user_a", "a@example.com")], persons={"user_a": [PERSON_A]}
    )

    def failing_bulk_delete(request):
        if request.url.path.endswith("/bulk_delete/"):
            return httpx.Response(500)
        return services.handler(request)

    async with services.client() as http:
        findings = await erasure.find(["a@example.com"], config=CONFIG, http=http)
    async with httpx.AsyncClient(transport=httpx.MockTransport(failing_bulk_delete)) as http:
        erased = await erasure.erase(findings, config=CONFIG, http=http)

    assert erased.clerk_users == 0
    assert erased.errors[0].startswith("PostHog persons")
    assert not any(m == "DELETE" for m, _, _ in services.requests)


async def test_user_id_without_an_account_cleans_up_leftovers(scenarios):
    async with FakeServices().client() as http:
        findings = await erasure.find([], ["user_a"], config=CONFIG, http=http)
    assert findings.clerk_users == []
    assert findings.scenarios == {"user_a": 2}


async def test_unconfigured_services_are_skipped_and_reported(monkeypatch):
    async def no_db(user_id):
        raise erasure.store.StorageUnavailable("Database not available")

    monkeypatch.setattr(erasure.store, "count_all", no_db)
    findings = await erasure.find(["a@example.com"], ["user_a"], config=erasure.Config())
    assert len(findings.skipped) == 3
    assert findings.is_empty()


async def test_forget_web_person_deletes_by_distinct_id(monkeypatch):
    monkeypatch.setenv("POSTHOG_PERSONAL_API_KEY", "phx_test")
    monkeypatch.setenv("POSTHOG_PROJECT_ID", "123")
    services = FakeServices()
    async with services.client() as http:
        await erasure.forget_web_person("user_a", http=http)
    assert services.requests == [
        (
            "POST",
            f"{PH}/persons/bulk_delete/",
            {"delete_events": True, "delete_recordings": True, "distinct_ids": ["user_a"]},
        )
    ]


async def test_forget_web_person_never_raises(monkeypatch):
    monkeypatch.setenv("POSTHOG_PERSONAL_API_KEY", "phx_test")
    monkeypatch.setenv("POSTHOG_PROJECT_ID", "123")
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(500))) as h:
        await erasure.forget_web_person("user_a", http=h)


async def test_forget_web_person_is_a_no_op_without_posthog(monkeypatch):
    monkeypatch.delenv("POSTHOG_PERSONAL_API_KEY", raising=False)
    services = FakeServices()
    async with services.client() as http:
        await erasure.forget_web_person("user_a", http=http)
    assert services.requests == []


def test_script_describes_findings_and_manual_steps():
    findings = erasure.Findings(
        clerk_users=[erasure.ClerkUser("user_a", ("a@example.com",))],
        scenarios={"user_a": 2},
        unlinked_feedback=[erasure.FeedbackEvent("e3", "feedback-anon:s1", "2026-10-03", "X")],
    )
    lines = delete_user_data.describe(findings)
    assert lines[0] == "Clerk account user_a (a@example.com)"
    assert "2 saved scenario(s) for user_a" in lines
    assert any("e3" in line for line in delete_user_data.manual_steps(findings))


def test_script_requires_an_email_or_user_id():
    with pytest.raises(SystemExit):
        delete_user_data.main([])
