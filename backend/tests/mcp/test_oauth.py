"""Sign-in for /mcp: the guard, OAuth discovery documents, and saved-scenario tools acting
for the signed-in user. (The end-to-end HTTP test with a real MCP client lives in
test_server.py, since the session manager can start only once per process.)"""

import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from app.auth.identity import USER_SCOPE_KEY, acting_as
from app.mcp import server
from app.mcp.server import mcp
from tests.auth_support import ISSUER, USER, bearer

HEADERS = {"content-type": "application/json", "accept": "application/json, text/event-stream"}
BODY = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}

SCENARIO = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


class Recorder:
    """Stands in for the MCP app behind the guard: records what reached it."""

    def __init__(self):
        self.scopes = []

    async def __call__(self, scope, receive, send):
        self.scopes.append(scope)
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})


async def call_guard(headers: dict, method: str = "POST"):
    import httpx

    recorder = Recorder()
    transport = httpx.ASGITransport(app=server._Guard(recorder))
    async with httpx.AsyncClient(transport=transport, base_url="https://api.example") as client:
        response = await client.request(method, "/mcp", json=BODY, headers=headers)
    return response, recorder


async def test_requires_a_token_when_oauth_is_on(clerk_env):
    response, recorder = await call_guard(HEADERS)
    assert response.status_code == 401
    challenge = response.headers["www-authenticate"]
    assert challenge.startswith("Bearer ")
    assert (
        'resource_metadata="https://api.example/.well-known/oauth-protected-resource/mcp"'
        in challenge
    )
    assert recorder.scopes == []

    response, _ = await call_guard({**HEADERS, **bearer("oat_unknown")})
    assert response.status_code == 401
    assert 'error="invalid_token"' in response.headers["www-authenticate"]

    response, _ = await call_guard({**HEADERS, **bearer("oat_revoked")}, method="GET")
    assert response.status_code == 401


async def test_valid_token_reaches_the_server_as_the_user(clerk_env):
    response, recorder = await call_guard({**HEADERS, **bearer("oat_alice")})
    assert response.status_code == 200
    assert recorder.scopes[0][USER_SCOPE_KEY] == USER


async def test_open_when_oauth_is_off(monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    response, recorder = await call_guard(HEADERS)
    assert response.status_code == 200
    assert recorder.scopes[0][USER_SCOPE_KEY] is None


async def test_user_header_is_trusted_only_from_the_web_assistant(clerk_env, monkeypatch):
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "s3cret")
    spoofed = {**HEADERS, **bearer("oat_alice"), server.USER_HEADER: "user_mallory"}
    _, recorder = await call_guard(spoofed)
    assert recorder.scopes[0][USER_SCOPE_KEY] == USER

    internal = {**HEADERS, server.INTERNAL_HEADER: "s3cret", server.USER_HEADER: "user_web"}
    response, recorder = await call_guard(internal)
    assert response.status_code == 200  # no OAuth token needed
    assert recorder.scopes[0][USER_SCOPE_KEY] == "user_web"

    signed_out = {**HEADERS, server.INTERNAL_HEADER: "s3cret"}
    _, recorder = await call_guard(signed_out)
    assert recorder.scopes[0][USER_SCOPE_KEY] is None


async def test_daily_limit_is_per_user(clerk_env, monkeypatch):
    server._mcp_limiter.reset()
    monkeypatch.setattr(server, "_requests_per_user_per_day", lambda: 1)
    auth = {**HEADERS, **bearer("oat_alice")}
    assert (await call_guard(auth))[0].status_code == 200
    assert (await call_guard(auth))[0].status_code == 429
    server._mcp_limiter.reset()


async def test_protected_resource_metadata(async_client, clerk_env, monkeypatch):
    for path in (
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-protected-resource",
    ):
        response = await async_client.get(path)
        assert response.status_code == 200
        data = response.json()
        assert data["resource"] == "http://test/mcp"
        assert data["authorization_servers"] == [ISSUER]
        assert data["scopes_supported"] == ["profile", "email"]
        assert data["bearer_methods_supported"] == ["header"]

    monkeypatch.setenv("MCP_RESOURCE_URL", "https://api.rothconversionsoptimizer.com/mcp")
    response = await async_client.get("/.well-known/oauth-protected-resource/mcp")
    assert response.json()["resource"] == "https://api.rothconversionsoptimizer.com/mcp"


async def test_resource_url_follows_the_proxy(async_client, clerk_env):
    response = await async_client.get(
        "/.well-known/oauth-protected-resource/mcp",
        headers={"x-forwarded-proto": "https", "x-forwarded-host": "api.example"},
    )
    assert response.json()["resource"] == "https://api.example/mcp"


async def test_authorization_server_metadata_passthrough(async_client, clerk_env):
    response = await async_client.get("/.well-known/oauth-authorization-server")
    assert response.status_code == 200
    assert response.json()["issuer"] == ISSUER
    response = await async_client.get("/.well-known/openid-configuration")
    assert response.json()["jwks_uri"] == "y"


async def test_discovery_is_off_without_oauth(async_client, monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    for path in (
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-authorization-server",
    ):
        assert (await async_client.get(path)).status_code == 404


# --------------------------------------------------------------------------
# Saved scenario tools
# --------------------------------------------------------------------------


async def test_saved_scenario_tools_act_for_the_user(memory_store):
    with acting_as(USER):
        async with create_connected_server_and_client_session(mcp) as session:
            saved = await session.call_tool(
                "save_scenario", {"scenario": SCENARIO, "name": "Retire at 60"}
            )
            assert not saved.isError
            scenario_id = saved.structuredContent["saved"]["scenario_id"]

            listed = await session.call_tool("list_saved_scenarios", {})
            assert [s["name"] for s in listed.structuredContent["saved_scenarios"]] == [
                "Retire at 60"
            ]

            opened = await session.call_tool("open_saved_scenario", {"scenario_id": scenario_id})
            data = opened.structuredContent
            assert data["name"] == "Retire at 60"
            assert data["ready_to_run"] is True
            assert data["scenario"]["retirement_age"] == 60

            missing = await session.call_tool("open_saved_scenario", {"scenario_id": "nope"})
            assert missing.isError and missing.structuredContent["code"] == "not_found"

    # Saved under the user, not anyone else.
    assert [s.name for s in await memory_store.list(USER)] == ["Retire at 60"]


@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("save_scenario", {"scenario": SCENARIO}),
        ("list_saved_scenarios", {}),
        ("open_saved_scenario", {"scenario_id": "x"}),
    ],
)
async def test_saved_scenario_tools_need_a_user(memory_store, tool, arguments):
    async with create_connected_server_and_client_session(mcp) as session:
        result = await session.call_tool(tool, arguments)
    assert result.isError
    assert result.structuredContent["code"] == "sign_in_required"


async def test_save_rejects_an_invalid_scenario(memory_store):
    with acting_as(USER):
        async with create_connected_server_and_client_session(mcp) as session:
            result = await session.call_tool(
                "save_scenario", {"scenario": {**SCENARIO, "state": "zz"}}
            )
    assert result.isError
