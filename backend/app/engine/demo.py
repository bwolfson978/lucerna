from app.engine.types import ScenarioInput, FilingStatus, YearlyIncome, LifeEvent
from app.engine.optimizer import optimize

DEMO_SCENARIO = ScenarioInput(
    age=38,
    filing_status=FilingStatus.SINGLE,
    income_trajectory=[
        YearlyIncome(year=2026, gross_income=35000, life_event=LifeEvent.STARTUP),
        YearlyIncome(year=2027, gross_income=30000, life_event=LifeEvent.STARTUP),
        YearlyIncome(year=2028, gross_income=150000, life_event=LifeEvent.BACK_TO_WORK),
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
    "income_trajectory": [
        {"year": 2026, "income": "$35K", "event": "Startup year 1 (6 months salary before leaving)"},
        {"year": 2027, "income": "$30K", "event": "Startup year 2 (minimal founder salary)"},
        {"year": 2028, "income": "$150K", "event": "Back to work (startup acquired / new role)"},
    ],
    "ira_balance": "$210,000 (traditional 401k rollover from 14 years of work)",
    "filing_status": "Single",
    "key_insight": "Two low-income years create a window to convert at 10-22% instead of the 24% bracket Alex would be in at $150K",
}


def get_demo() -> dict:
    """Get the pre-computed demo scenario and results."""
    result = optimize(DEMO_SCENARIO)
    return {
        "persona": DEMO_PERSONA,
        "input": DEMO_SCENARIO,
        "result": result,
    }
