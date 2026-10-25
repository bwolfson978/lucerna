"""Full results links: what a View (or a model in another app) links to, and the
endpoint the website opens them with."""

import datetime
from urllib.parse import parse_qs, urlparse

from httpx import ASGITransport, AsyncClient
from mcp.shared.memory import create_connected_server_and_client_session

from app.main import app
from app.mcp.server import mcp
from app.tools.links import decode_scenario, encode_scenario, full_results_url

THIS_YEAR = datetime.date.today().year

SCENARIO = {
    "birth_year": THIS_YEAR - 52,
    "birth_month": 6,
    "filing_status": "married_filing_jointly",
    "spouse_birth_year": THIS_YEAR - 52,
    "spouse_birth_month": 3,
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
    "income_changes": [{"year": 2027, "gross_income": 40000, "note": "Sabbatical"}],
}


def _params(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}


def test_encoding_round_trips_and_rejects_garbage():
    assert decode_scenario(encode_scenario(SCENARIO)) == SCENARIO
    for bad in ["", "!!!", encode_scenario({}) + "x" * 9000, "WzFd"]:  # "WzFd" = [1]
        try:
            decode_scenario(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad!r}")


def test_url_shape(monkeypatch):
    monkeypatch.setenv("SITE_URL", "https://example.test/")
    url = full_results_url(SCENARIO, "r_0123456789", "Retire at 58")
    assert url.startswith("https://example.test/calculator?")
    params = _params(url)
    assert params["view"] == "results" and params["result"] == "r_0123456789"
    assert params["label"] == "Retire at 58"
    assert decode_scenario(params["scenario"]) == SCENARIO


async def test_tool_links_open_the_same_result():
    async with create_connected_server_and_client_session(mcp) as session:
        analyzed = await session.call_tool(
            "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": True}
        )
        compared = await session.call_tool(
            "compare_roth_scenarios",
            {"scenario": SCENARIO, "changes": {"retirement_age": 58}, "label": "Retire at 58"},
        )
    data = analyzed.structuredContent
    what_if = compared.structuredContent

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        params = _params(data["full_results_url"])
        response = await client.post(
            "/api/scenario-links/open", json={"scenario": params["scenario"]}
        )
        assert response.status_code == 200
        opened = response.json()
        # Same scenario in, same result out: the id matches the tool's.
        assert opened["result_id"] == data["result_id"] == params["result"]
        assert opened["label"] == "Your scenario"
        assert opened["draft"]["age"] == 52
        assert any(y.get("notes") == "Sabbatical" for y in opened["draft"]["timeline"])
        assert (
            round(opened["result"]["estimated_lifetime_tax_savings"])
            == (data["estimated_lifetime_tax_savings_todays_dollars"])
        )

        params = _params(what_if["what_if_full_results_url"])
        response = await client.post(
            "/api/scenario-links/open",
            json={"scenario": params["scenario"], "label": params["label"]},
        )
        assert response.json()["result_id"] == what_if["variant_result_id"]
        assert response.json()["label"] == "Retire at 58"


async def test_bad_links_are_400s():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for scenario in [
            "!!!",
            encode_scenario({"birth_year": "old"}),
            encode_scenario({"birth_year": THIS_YEAR - 52}),
        ]:
            response = await client.post("/api/scenario-links/open", json={"scenario": scenario})
            assert response.status_code == 400, scenario
            assert response.json()["detail"]
