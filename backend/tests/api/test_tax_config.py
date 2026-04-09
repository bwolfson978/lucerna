"""Tests for the /api/tax-config endpoint."""


async def test_tax_config_returns_200(async_client):
    """GET /api/tax-config should return 200 with bracket data."""
    response = await async_client.get("/api/tax-config")
    assert response.status_code == 200
    data = response.json()

    assert "standard_deduction" in data
    assert "brackets" in data

    # Standard deductions present for both filing statuses
    assert data["standard_deduction"]["single"] == 16100
    assert data["standard_deduction"]["married_filing_jointly"] == 32200

    # Brackets present for both filing statuses
    for fs in ("single", "married_filing_jointly"):
        brackets = data["brackets"][fs]
        assert len(brackets) == 7

        # Rates are ascending
        rates = [b["rate"] for b in brackets]
        assert rates == sorted(rates)

        # First bracket starts at 0
        assert brackets[0]["min"] == 0

        # Last bracket max is null (unbounded)
        assert brackets[-1]["max"] is None

        # Brackets are contiguous
        for i in range(1, len(brackets)):
            assert brackets[i]["min"] == brackets[i - 1]["max"]
