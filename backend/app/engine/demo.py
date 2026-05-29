from app.engine.optimizer import optimize
from app.engine.types import FilingStatus, PlanYear, ScenarioInput

DEMO_SCENARIO = ScenarioInput(
    age=63,
    filing_status=FilingStatus.MFJ,
    timeline=[
        # Income valley: retired, living off brokerage, no Social Security yet
        PlanYear(year=2026, gross_income=20000, notes="Brokerage only"),
        PlanYear(year=2027, gross_income=20000, notes="Bridge year"),
        PlanYear(year=2028, gross_income=20000, notes="Medicare starts"),
        PlanYear(year=2029, gross_income=20000, notes="Waiting for FRA"),
        # Social Security claims
        PlanYear(year=2030, gross_income=46000, notes="SS starts"),
        PlanYear(year=2031, gross_income=58000, notes="Spouse SS starts"),
        PlanYear(year=2032, gross_income=60000, notes="Full SS income"),
        PlanYear(year=2033, gross_income=60000, notes="Stable income"),
        PlanYear(year=2034, gross_income=62000, notes="Pre-RMD window"),
        PlanYear(year=2035, gross_income=62000, notes="Last pre-RMD year"),
        # RMD years: engine funds spending from accounts while optimizer can still convert
        PlanYear(year=2036, gross_income=62000, drawdown=95000, notes="RMDs begin"),
        PlanYear(year=2037, gross_income=62000, drawdown=95000, notes="RMD year 2"),
        PlanYear(year=2038, gross_income=62000, drawdown=95000, notes="RMD year 3"),
        PlanYear(year=2039, gross_income=62000, drawdown=95000, notes="RMD year 4"),
        PlanYear(year=2040, gross_income=62000, drawdown=95000, notes="RMD year 5"),
        PlanYear(year=2041, gross_income=62000, drawdown=95000, notes="RMD year 6"),
        PlanYear(year=2042, gross_income=62000, drawdown=95000, notes="RMD year 7"),
        PlanYear(year=2043, gross_income=62000, drawdown=95000, notes="RMD year 8"),
        PlanYear(year=2044, gross_income=62000, drawdown=95000, notes="RMD year 9"),
        PlanYear(year=2045, gross_income=62000, drawdown=95000, notes="RMD year 10"),
        PlanYear(year=2046, gross_income=62000, drawdown=95000, notes="RMD year 11"),
    ],
    traditional_ira_balance=1_400_000,
    roth_ira_balance=52_000,
    drawdown_start_age=73,
    default_drawdown=95_000,
    planning_horizon_age=93,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)

DEMO_PERSONA = {
    "name": "Margaret",
    "age": 63,
    "occupation": "Registered Nurse",
    "previous_salary": "$88,000/year",
    "situation": "Retired last year after a 35-year nursing career. Living off a taxable brokerage account and cash. Social Security deferred. Traditional 401(k) of $1.4M will trigger mandatory distributions at 73.",
    "milestones": [
        {"year": 2026, "income": "$20K", "event": "Living off brokerage, no Social Security yet"},
        {"year": 2030, "income": "$46K", "event": "Claims Social Security at full retirement age"},
        {
            "year": 2036,
            "income": "RMDs begin",
            "event": "Mandatory distributions on $1.4M+ balance",
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
