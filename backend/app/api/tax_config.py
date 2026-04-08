from fastapi import APIRouter

from app.engine.tax import BRACKETS, STANDARD_DEDUCTION
from app.engine.types import FilingStatus

router = APIRouter()


@router.get("/tax-config")
async def tax_config():
    """Serve federal tax bracket data to the frontend.

    The frontend fetches this on page load so it always uses the same
    bracket data as the backend, then falls back to its bundled JSON
    if the backend is unreachable.
    """

    def serialize_brackets(brackets: list[dict]) -> list[dict]:
        return [
            {
                "min": b["min"],
                "max": None if b["max"] == float("inf") else b["max"],
                "rate": b["rate"],
            }
            for b in brackets
        ]

    return {
        "standard_deduction": {
            "single": STANDARD_DEDUCTION[FilingStatus.SINGLE],
            "married_filing_jointly": STANDARD_DEDUCTION[FilingStatus.MFJ],
        },
        "brackets": {
            "single": serialize_brackets(BRACKETS[FilingStatus.SINGLE]),
            "married_filing_jointly": serialize_brackets(BRACKETS[FilingStatus.MFJ]),
        },
    }
