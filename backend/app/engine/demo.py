from app.engine.optimizer import optimize
from app.engine.types import FilingStatus, ScenarioInput, YearlyIncome

DEMO_SCENARIO = ScenarioInput(
    age=38,
    filing_status=FilingStatus.SINGLE,
    income_timeline=[
        # Startup window — the conversion opportunity
        YearlyIncome(year=2026, gross_income=35000, notes="Startup year 1"),
        YearlyIncome(year=2027, gross_income=30000, notes="Startup year 2"),
        # Back to work — acquired / new senior role
        YearlyIncome(year=2028, gross_income=150000, notes="Back to work"),
        # Career growth
        YearlyIncome(year=2029, gross_income=155000),
        YearlyIncome(year=2030, gross_income=160000),
        YearlyIncome(year=2031, gross_income=165000),
        YearlyIncome(year=2032, gross_income=170000),
        YearlyIncome(year=2033, gross_income=175000),
        YearlyIncome(year=2034, gross_income=180000),
        YearlyIncome(year=2035, gross_income=185000),
        # Sabbatical year
        YearlyIncome(year=2036, gross_income=100000, notes="Sabbatical"),
        # Senior IC / management
        YearlyIncome(year=2037, gross_income=190000),
        YearlyIncome(year=2038, gross_income=195000),
        YearlyIncome(year=2039, gross_income=200000),
        YearlyIncome(year=2040, gross_income=205000),
        YearlyIncome(year=2041, gross_income=210000),
        YearlyIncome(year=2042, gross_income=210000),
        YearlyIncome(year=2043, gross_income=210000),
        YearlyIncome(year=2044, gross_income=205000),
        YearlyIncome(year=2045, gross_income=200000),
        # Winding down
        YearlyIncome(year=2046, gross_income=195000),
        YearlyIncome(year=2047, gross_income=190000),
        YearlyIncome(year=2048, gross_income=180000),
        YearlyIncome(year=2049, gross_income=160000, notes="Part-time"),
        YearlyIncome(year=2050, gross_income=140000, notes="Part-time"),
        YearlyIncome(year=2051, gross_income=120000, notes="Part-time"),
        YearlyIncome(year=2052, gross_income=80000, notes="Part-time"),
    ],
    traditional_ira_balance=210000,
    roth_ira_balance=5000,
    retirement_age=65,
    years_in_retirement=25,
    annual_retirement_spending=70000,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)

DEMO_PERSONA = {
    "name": "Alex",
    "age": 38,
    "occupation": "Senior Software Engineer",
    "previous_salary": "$145,000/year",
    "situation": "Left job 6 months ago to co-found a startup",
    "income_timeline": [
        {
            "year": 2026,
            "income": "$35K",
            "notes": "Startup year 1 (6 months salary before leaving)",
        },
        {"year": 2027, "income": "$30K", "notes": "Startup year 2 (minimal founder salary)"},
        {"year": 2028, "income": "$150K", "notes": "Back to work (startup acquired / new role)"},
    ],
    "career_arc": "Career growth to $210K peak, sabbatical at 48, winding down to part-time before retiring at 65",
    "ira_balance": "$210,000 (traditional 401k rollover from 14 years of work)",
    "filing_status": "Single",
    "key_insight": "Two low-income startup years create a window to convert at 10-22% instead of the 24% bracket Alex would be in at $150K+",
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
