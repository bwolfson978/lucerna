from app.engine.optimizer import optimize
from app.engine.types import FilingStatus, ScenarioInput, YearlyIncome

DEMO_SCENARIO = ScenarioInput(
    age=63,
    filing_status=FilingStatus.MFJ,
    income_timeline=[
        # Income valley: retired, living off brokerage, no Social Security yet
        YearlyIncome(
            year=2026, gross_income=20000, notes="Living off brokerage, no Social Security yet"
        ),
        YearlyIncome(
            year=2027, gross_income=20000, notes="Bridge year, drawing from brokerage and cash"
        ),
        YearlyIncome(
            year=2028, gross_income=20000, notes="Medicare starts, deferring Social Security"
        ),
        YearlyIncome(
            year=2029, gross_income=20000, notes="Waiting for full retirement age benefit"
        ),
        # Social Security claims
        YearlyIncome(
            year=2030, gross_income=46000, notes="Claims Social Security at full retirement age"
        ),
        YearlyIncome(
            year=2031,
            gross_income=58000,
            notes="Spouse claims Social Security, combined income rises",
        ),
        YearlyIncome(
            year=2032,
            gross_income=60000,
            notes="Full combined Social Security and brokerage income",
        ),
        YearlyIncome(year=2033, gross_income=60000, notes="Stable income phase"),
        YearlyIncome(year=2034, gross_income=62000, notes="Final years before RMD window closes"),
        YearlyIncome(
            year=2035, gross_income=62000, notes="Last year before required minimum distributions"
        ),
    ],
    traditional_ira_balance=1_400_000,
    roth_ira_balance=52_000,
    retirement_age=73,
    years_in_retirement=20,
    annual_retirement_spending=95_000,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)

DEMO_PERSONA = {
    "name": "Margaret",
    "age": 63,
    "occupation": "Registered Nurse",
    "previous_salary": "$88,000/year",
    "situation": "Retired last year after a 35-year nursing career. Living off a taxable brokerage account and cash. Social Security deferred. Traditional 401(k) of $1.4M will trigger mandatory distributions at 73.",
    "income_timeline": [
        {"year": 2026, "income": "$20K", "notes": "Living off brokerage, no Social Security yet"},
        {"year": 2030, "income": "$46K", "notes": "Claims Social Security at full retirement age"},
        {
            "year": 2036,
            "income": "RMDs begin",
            "notes": "Mandatory distributions on $1.4M+ balance",
        },
    ],
    "career_arc": "35 years as a registered nurse, saving consistently in her employer 401(k). Roth contributions started in her final decade once pre-tax balance grew large. No earned income planned; income rises sharply at 73 when mandatory distributions begin.",
    "ira_balance": "$1,400,000 traditional 401(k) + $52,000 Roth, from 35 years of consistent saving",
    "filing_status": "Married Filing Jointly",
    "key_insight": "The 10-year window between retirement and mandatory distributions lets Margaret convert at 12-22% today. Once RMDs begin on a balance that may exceed $2.7M, combined income could push her marginal rate significantly higher.",
}


_cached_demo: dict | None = None


def get_demo() -> dict:
    """Get the demo scenario and results, cached after first computation."""
    global _cached_demo
    if _cached_demo is None:
        result = optimize(DEMO_SCENARIO)
        _cached_demo = {
            "persona": DEMO_PERSONA,
            "input": DEMO_SCENARIO,
            "result": result,
        }
    return _cached_demo
