from app.engine.types import FilingStatus, BracketFillResult

# ==============================================
# 2025 Federal Tax Brackets
# Source: IRS Revenue Procedure 2024-40
# ==============================================

BRACKETS = {
    FilingStatus.SINGLE: [
        {"min": 0, "max": 11925, "rate": 0.10},
        {"min": 11925, "max": 48475, "rate": 0.12},
        {"min": 48475, "max": 103350, "rate": 0.22},
        {"min": 103350, "max": 197300, "rate": 0.24},
        {"min": 197300, "max": 250525, "rate": 0.32},
        {"min": 250525, "max": 626350, "rate": 0.35},
        {"min": 626350, "max": float("inf"), "rate": 0.37},
    ],
    FilingStatus.MFJ: [
        {"min": 0, "max": 23850, "rate": 0.10},
        {"min": 23850, "max": 96950, "rate": 0.12},
        {"min": 96950, "max": 206700, "rate": 0.22},
        {"min": 206700, "max": 394600, "rate": 0.24},
        {"min": 394600, "max": 501050, "rate": 0.32},
        {"min": 501050, "max": 751600, "rate": 0.35},
        {"min": 751600, "max": float("inf"), "rate": 0.37},
    ],
}

STANDARD_DEDUCTION = {
    FilingStatus.SINGLE: 15000,
    FilingStatus.MFJ: 30000,
}


def calculate_federal_tax(
    gross_income: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> float:
    """Calculate federal income tax using progressive brackets.

    Takes gross income and subtracts the standard deduction internally.
    """
    deduction = STANDARD_DEDUCTION[filing_status]
    taxable_income = max(0, gross_income - deduction)
    brackets = BRACKETS[filing_status]

    tax = 0.0
    for bracket in brackets:
        if taxable_income <= bracket["min"]:
            break
        taxable_in_bracket = min(taxable_income, bracket["max"]) - bracket["min"]
        tax += taxable_in_bracket * bracket["rate"]

    return tax


def get_marginal_rate(
    gross_income: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> float:
    """Get the marginal tax rate at a given gross income level."""
    deduction = STANDARD_DEDUCTION[filing_status]
    taxable_income = max(0, gross_income - deduction)
    brackets = BRACKETS[filing_status]

    for bracket in brackets:
        if taxable_income >= bracket["min"] and taxable_income < bracket["max"]:
            return bracket["rate"]

    return brackets[-1]["rate"]


def analyze_bracket_fill(
    base_income: float,
    conversion_amount: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> list[BracketFillResult]:
    """Generate bracket fill analysis for the bracket visualization."""
    deduction = STANDARD_DEDUCTION[filing_status]
    base_taxable = max(0, base_income - deduction)
    total_taxable = max(0, base_income + conversion_amount - deduction)
    brackets = BRACKETS[filing_status]

    results = []
    for bracket in brackets:
        if bracket["max"] == float("inf"):
            capacity = 500000.0
        else:
            capacity = bracket["max"] - bracket["min"]

        filled_by_income = max(0, min(base_taxable, bracket["max"]) - bracket["min"])
        total_filled = max(0, min(total_taxable, bracket["max"]) - bracket["min"])
        filled_by_conversion = total_filled - filled_by_income
        remaining = max(0, capacity - total_filled)
        tax_in_bracket = total_filled * bracket["rate"]

        display_max = bracket["max"] if bracket["max"] != float("inf") else bracket["min"] + 500000

        results.append(BracketFillResult(
            bracket_rate=bracket["rate"],
            bracket_min=bracket["min"],
            bracket_max=display_max,
            bracket_capacity=capacity,
            filled_by_income=filled_by_income,
            filled_by_conversion=filled_by_conversion,
            remaining_capacity=remaining,
            tax_in_bracket=tax_in_bracket,
        ))

        if total_taxable <= bracket["max"]:
            break

    return results
