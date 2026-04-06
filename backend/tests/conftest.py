import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.engine.types import ScenarioInput, FilingStatus, YearlyIncome


@pytest.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def sample_single_input():
    """Factory — single filer, single-year timeline."""
    def _make(**overrides):
        defaults = dict(
            age=45, filing_status=FilingStatus.SINGLE,
            income_timeline=[YearlyIncome(year=2026, gross_income=85000)],
            traditional_ira_balance=250000, roth_ira_balance=0,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
        )
        defaults.update(overrides)
        return ScenarioInput(**defaults)
    return _make


@pytest.fixture
def sample_mfj_input():
    """Factory — MFJ, multi-year timeline."""
    def _make(**overrides):
        defaults = dict(
            age=50, filing_status=FilingStatus.MFJ,
            income_timeline=[
                YearlyIncome(year=2026, gross_income=150000),
                YearlyIncome(year=2027, gross_income=150000),
            ],
            traditional_ira_balance=500000, roth_ira_balance=50000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
        )
        defaults.update(overrides)
        return ScenarioInput(**defaults)
    return _make
