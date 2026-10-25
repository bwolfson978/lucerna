"""MCP sign-in (app/mcp/auth.py) and the saved-scenario tools."""

import datetime
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from mcp.shared.memory import create_connected_server_and_client_session

from app.db import scenarios as saved_store
from app.engine.demo import DEMO_SCENARIO
from app.mcp import auth as mcp_auth
from app.mcp import server
from app.mcp.limits import AnalysisLimiter, AnalysisLimits, current_caller
from app.mcp.server import mcp

THIS_YEAR = datetime.date.today().year

ISSUER = "https://clerk.example.com"

SCENARIO = {
    "birth_year": THIS_YEAR - 55,
    "birth_month": 6,
    "filing_status": "single",
    "current_income": 70000,
    "traditional_balance": 400000,
    "retirement_age": 62,
}

HEADERS = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    "host": "mcp.example.com",
    "x-forwarded-proto": "https",
}


def _call(name: str, arguments: dict | None = None) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments or {}},
    }


@pytest.fixture
def issuer(monkeypatch):
    monkeypatch.setenv("MCP_AUTH_ISSUER", ISSUER + "/")
    return ISSUER


class FakeStore:
    """In-memory stand-in for app.db.scenarios."""

    def __init__(self):
        self.rows: dict[str, saved_store.SavedScenario] = {}
        self.owners: dict[str, str] = {}

    async def save(self, user_id, inputs, result, *, name=None, scenario=None):
        saved_id = f"00000000-0000-0000-0000-{len(self.rows):012d}"
        name = name or saved_store.auto_name(inputs)
        self.rows[saved_id] = saved_store.SavedScenario(
            id=saved_id,
            name=name,
            created_at=datetime.datetime(2026, 10, 13, tzinfo=datetime.UTC),
            updated_at=datetime.datetime(2026, 10, 13, tzinfo=datetime.UTC),
            inputs=inputs,
            result=result,
            scenario=scenario,
        )
        self.owners[saved_id] = user_id
        return saved_id, name

    async def update(self, user_id, saved_id, inputs, result, *, name=None, scenario=None):
        if self.owners.get(saved_id) != user_id:
            return None
        row = self.rows[saved_id]
        self.rows[saved_id] = saved_store.SavedScenario(
            id=saved_id,
            name=name or row.name,
            created_at=row.created_at,
            updated_at=datetime.datetime(2026, 10, 20, tzinfo=datetime.UTC),
            inputs=inputs,
            result=result,
            scenario=scenario or row.scenario,
        )
        return saved_id, self.rows[saved_id].name

    async def list_for(self, user_id):
        return [
            saved_store.SavedSummary(
                id=row.id,
                name=row.name,
                created_at=row.created_at,
                updated_at=row.updated_at,
                filing_status=str(row.inputs.filing_status),
                num_years=len(row.inputs.timeline),
                estimated_savings=float(row.result.get("estimated_lifetime_tax_savings") or 0),
                ira_balance=row.inputs.traditional_ira_balance,
            )
            for saved_id, row in self.rows.items()
            if self.owners[saved_id] == user_id
        ]

    async def get(self, user_id, saved_id):
        if self.owners.get(saved_id) != user_id:
            return None
        return self.rows[saved_id]


@pytest.fixture
def store(monkeypatch):
    fake = FakeStore()
    for name in ("save", "update", "list_for", "get"):
        monkeypatch.setattr(saved_store, name, getattr(fake, name))
    return fake


async def _tool(caller: str | None, name: str, arguments: dict | None = None):
    # The caller is read in the server's task, which copies the context it starts in.
    token = current_caller.set(caller)
    try:
        async with create_connected_server_and_client_session(mcp) as session:
            return await session.call_tool(name, arguments or {})
    finally:
        current_caller.reset(token)


# --------------------------------------------------------------------------
# Discovery
# --------------------------------------------------------------------------


async def test_discovery_is_off_without_an_issuer(async_client, monkeypatch):
    monkeypatch.delenv("MCP_AUTH_ISSUER", raising=False)
    response = await async_client.get("/.well-known/oauth-protected-resource/mcp")
    assert response.status_code == 404


async def test_protected_resource_metadata(async_client, issuer):
    for path in (
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-protected-resource",
    ):
        response = await async_client.get(path, headers=HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert data["resource"] == "https://mcp.example.com/mcp"
        assert data["authorization_servers"] == [ISSUER]
        assert data["scopes_supported"] == ["profile", "email"]


async def test_authorization_server_metadata_is_proxied(async_client, issuer, monkeypatch):
    requested = []

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"issuer": ISSUER, "authorization_endpoint": f"{ISSUER}/oauth/authorize"}

    class FakeClient:
        def __init__(self, **_):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

        async def get(self, url):
            requested.append(url)
            return FakeResponse()

    monkeypatch.setattr(mcp_auth.httpx, "AsyncClient", FakeClient)
    mcp_auth._as_metadata.clear()
    for _ in range(2):
        response = await async_client.get("/.well-known/oauth-authorization-server")
        assert response.json()["issuer"] == ISSUER
    assert requested == [f"{ISSUER}/.well-known/oauth-authorization-server"]


# --------------------------------------------------------------------------
# The sign-in gate on /mcp
# --------------------------------------------------------------------------


async def test_account_tools_answer_401_without_a_token(async_client, issuer):
    response = await async_client.post("/mcp", json=_call("save_scenario"), headers=HEADERS)
    assert response.status_code == 401
    challenge = response.headers["www-authenticate"]
    assert challenge.startswith("Bearer ")
    assert (
        'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"'
        in challenge
    )
    assert 'scope="profile email"' in challenge
    assert "invalid_token" not in challenge

    batch = [_call("get_tax_brackets", {"filing_status": "single"}), _call("list_saved_scenarios")]
    response = await async_client.post("/mcp", json=batch, headers=HEADERS)
    assert response.status_code == 401


async def test_an_invalid_token_is_challenged_as_invalid(async_client, issuer, monkeypatch):
    monkeypatch.setattr(mcp_auth, "verify_access_token", lambda token: None)
    headers = {**HEADERS, "authorization": "Bearer expired"}
    response = await async_client.post("/mcp", json=_call("open_saved_scenario"), headers=headers)
    assert response.status_code == 401
    assert 'error="invalid_token"' in response.headers["www-authenticate"]


def test_calls_account_tool():
    assert mcp_auth.calls_account_tool(_call("save_scenario"))
    assert mcp_auth.calls_account_tool([{"method": "ping"}, _call("list_saved_scenarios")])
    assert not mcp_auth.calls_account_tool(_call("analyze_roth_conversions"))
    assert not mcp_auth.calls_account_tool({"method": "tools/list"})
    assert not mcp_auth.calls_account_tool(None)


# --------------------------------------------------------------------------
# Token verification
# --------------------------------------------------------------------------


@pytest.fixture
def signing_key(issuer):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    mcp_auth._jwks_clients[ISSUER] = SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())
    )
    yield key
    mcp_auth._jwks_clients.pop(ISSUER, None)


def _token(key, **claims) -> str:
    payload = {"iss": ISSUER, "sub": "user_123", "exp": int(time.time()) + 600} | claims
    return jwt.encode(payload, key, algorithm="RS256", headers={"typ": "at+jwt"})


def test_verify_access_token(signing_key):
    assert mcp_auth.verify_access_token(_token(signing_key)) == "user_123"
    assert mcp_auth.verify_access_token(_token(signing_key, iss="https://evil.example")) is None
    assert mcp_auth.verify_access_token(_token(signing_key, exp=int(time.time()) - 5)) is None
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert mcp_auth.verify_access_token(_token(other)) is None
    assert mcp_auth.verify_access_token("not a jwt") is None


def test_verify_access_token_needs_an_issuer(monkeypatch):
    monkeypatch.delenv("MCP_AUTH_ISSUER", raising=False)
    assert mcp_auth.verify_access_token("anything") is None


# --------------------------------------------------------------------------
# Account tools
# --------------------------------------------------------------------------


async def test_tools_declare_their_auth_for_chatgpt():
    async with create_connected_server_and_client_session(mcp) as session:
        tools = {t.name: t for t in (await session.list_tools()).tools}
    for name in mcp_auth.ACCOUNT_TOOLS:
        assert tools[name].meta["securitySchemes"][0]["type"] == "oauth2"
    for name in ("prepare_scenario", "analyze_roth_conversions", "get_tax_brackets"):
        assert tools[name].meta["securitySchemes"] == [{"type": "noauth"}]
    assert tools["save_scenario"].annotations.readOnlyHint is False
    assert tools["save_scenario"].annotations.destructiveHint is False


async def test_account_tools_without_sign_in(issuer):
    result = await _tool("ip:1.2.3.4", "list_saved_scenarios")
    assert result.isError
    assert "sign in" in result.structuredContent["error"]
    assert result.meta["mcp/www_authenticate"][0].startswith("Bearer ")


async def test_account_tools_when_sign_in_is_off(monkeypatch):
    monkeypatch.delenv("MCP_AUTH_ISSUER", raising=False)
    result = await _tool("ip:1.2.3.4", "save_scenario", {"scenario": SCENARIO})
    assert result.isError and "isn't available yet" in result.structuredContent["error"]


async def test_save_list_and_open(issuer, store):
    saved = await _tool("user:u1", "save_scenario", {"scenario": SCENARIO, "name": "Retire at 62"})
    assert not saved.isError
    data = saved.structuredContent
    assert data["name"] == "Retire at 62"
    assert data["open_url"].endswith(f"/calculator?saved={data['saved_id']}")
    assert data["estimated_lifetime_tax_savings_todays_dollars"] > 0

    listed = (await _tool("user:u1", "list_saved_scenarios")).structuredContent
    assert [s["saved_id"] for s in listed["scenarios"]] == [data["saved_id"]]
    assert listed["scenarios"][0]["saved_on"] == "2026-10-13"

    # Another user sees nothing of it.
    assert (await _tool("user:u2", "list_saved_scenarios")).structuredContent["scenarios"] == []
    missing = await _tool("user:u2", "open_saved_scenario", {"saved_id": data["saved_id"]})
    assert missing.isError

    opened = await _tool("user:u1", "open_saved_scenario", {"saved_id": data["saved_id"]})
    content = opened.structuredContent
    assert content["scenario"]["birth_year"] == THIS_YEAR - 55 and "note" not in content
    # The opened scenario runs as is.
    again = await _tool(
        "user:u1",
        "analyze_roth_conversions",
        {"scenario": content["scenario"], "user_confirmed": True},
    )
    assert not again.isError


async def test_saving_with_a_saved_id_updates_that_scenario(issuer, store):
    first = (await _tool("user:u1", "save_scenario", {"scenario": SCENARIO})).structuredContent
    changed = {**SCENARIO, "retirement_age": 60}
    again = await _tool(
        "user:u1", "save_scenario", {"scenario": changed, "saved_id": first["saved_id"]}
    )
    assert again.structuredContent["saved_id"] == first["saved_id"]
    assert len(store.rows) == 1
    assert store.rows[first["saved_id"]].scenario["retirement_age"] == 60
    listed = (await _tool("user:u1", "list_saved_scenarios")).structuredContent["scenarios"]
    assert listed[0]["saved_on"] == "2026-10-20"
    # Someone else's id, or one that doesn't exist, is not touched.
    other = await _tool(
        "user:u2", "save_scenario", {"scenario": SCENARIO, "saved_id": first["saved_id"]}
    )
    assert other.isError and len(store.rows) == 1
    # Without an id it is a new scenario.
    await _tool("user:u1", "save_scenario", {"scenario": changed})
    assert len(store.rows) == 2


async def test_open_a_website_save(issuer, store):
    store.rows["web"] = saved_store.SavedScenario(
        id="web",
        name="From the website",
        created_at=datetime.datetime(2026, 9, 1, tzinfo=datetime.UTC),
        updated_at=datetime.datetime(2026, 9, 1, tzinfo=datetime.UTC),
        inputs=DEMO_SCENARIO,
        result={"estimated_lifetime_tax_savings": 1234.4},
        scenario=None,
    )
    store.owners["web"] = "u1"
    opened = (await _tool("user:u1", "open_saved_scenario", {"saved_id": "web"})).structuredContent
    assert "note" in opened
    assert opened["estimated_lifetime_tax_savings_when_saved"] == 1234
    assert opened["scenario"]["traditional_balance"] == DEMO_SCENARIO.traditional_ira_balance
    assert opened["scenario"]["birth_year"] == 2026 - DEMO_SCENARIO.age
    recorded = await _tool("user:u1", "prepare_scenario", {"scenario": opened["scenario"]})
    # Saved before birth months were asked for: the chat asks for them.
    assert recorded.structuredContent["missing_required"] == [
        "birth_month",
        "spouse_birth_year",
        "spouse_birth_month",
    ]
    assert "month and year you were born" in recorded.structuredContent["why_birth_date"]


async def test_open_a_chat_save_from_before_birth_dates(issuer, store):
    """A chat save that has an age: the age it had when last saved gives the birth year."""
    legacy = {k: v for k, v in SCENARIO.items() if not k.startswith("birth")}
    store.rows["old"] = saved_store.SavedScenario(
        id="old",
        name="Old chat save",
        created_at=datetime.datetime(2026, 9, 1, tzinfo=datetime.UTC),
        updated_at=datetime.datetime(2026, 9, 1, tzinfo=datetime.UTC),
        inputs=DEMO_SCENARIO,
        result={},
        scenario={**legacy, "age": 55},
    )
    store.owners["old"] = "u1"
    opened = (await _tool("user:u1", "open_saved_scenario", {"saved_id": "old"})).structuredContent
    assert opened["scenario"]["birth_year"] == 1971 and "age" not in opened["scenario"]


async def test_saving_counts_against_the_signed_in_limit(issuer, store, monkeypatch):
    limits = AnalysisLimits(
        per_anonymous_caller_per_day=0,
        per_user_per_day=0,
        anonymous_per_day=0,
        max_concurrent=1,
        queue_seconds=1,
    )
    monkeypatch.setattr(server, "_analysis_limiter", AnalysisLimiter(limits))
    fresh = {**SCENARIO, "birth_year": THIS_YEAR - 56}
    result = await _tool("user:u1", "save_scenario", {"scenario": fresh})
    assert result.structuredContent["limit_reached"] == "daily_limit"
    # Signed in already: no sign-in pitch.
    assert "Signing in" not in result.structuredContent["error"]

    anonymous = await _tool(
        "ip:1.2.3.4", "analyze_roth_conversions", {"scenario": fresh, "user_confirmed": True}
    )
    assert "Signing in" in anonymous.structuredContent["error"]
