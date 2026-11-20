"""Tests for the /api/optimize endpoint."""


async def test_optimize_valid_input(async_client, sample_single_input):
    """POST /api/optimize with valid inputs should return 200."""
    response = await async_client.post(
        "/api/optimize", json=sample_single_input().model_dump(mode="json")
    )
    assert response.status_code == 200
    data = response.json()
    assert "yearly_conversions" in data
    assert "estimated_lifetime_tax_savings" in data


async def test_optimize_missing_fields(async_client):
    """POST /api/optimize with empty body should return 422 validation error."""
    response = await async_client.post("/api/optimize", json={})
    assert response.status_code == 422


async def test_optimize_sends_the_cards_display_data(async_client, sample_single_input):
    """The web app shows results from the server's display data, the same the MCP App
    Views get, and doesn't receive the (megabytes) conversion curve."""
    data = (
        await async_client.post("/api/optimize", json=sample_single_input().model_dump(mode="json"))
    ).json()
    card, view = data["display"]["card"], data["display"]["view"]
    assert card["total_conversion"] == round(data["total_conversion"])
    assert card["total_tax_on_conversions"] == round(data["total_tax_on_conversions"])
    assert len(view["bracket_fill"]["years"]) == len(data["input"]["timeline"])
    # Each year's tax adds up to the total, give or take rounding.
    years = view["bracket_fill"]["years"]
    assert abs(sum(y["tax"] for y in years) - card["total_tax_on_conversions"]) <= len(years)
    assert len(view["curve"]["points"]) >= 2
    assert data["conversion_curve"] == []
