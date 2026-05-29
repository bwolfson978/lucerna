"""Tool definitions for Anthropic function calling.

These tools allow the AI to re-run the optimizer with modified inputs
when a user asks "what if" questions during the chat.
"""

TOOLS = [
    {
        "name": "rerun_optimization",
        "description": (
            "Re-run the Roth conversion optimization with modified inputs. "
            "Use this when the user asks 'what if' questions like "
            "'What if my income drops to $50k?' or "
            "'What if I start drawdowns at 70 instead of 73?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "age": {
                    "type": "integer",
                    "description": "Current age of the user",
                },
                "filing_status": {
                    "type": "string",
                    "enum": ["single", "married_filing_jointly"],
                    "description": "Tax filing status",
                },
                "traditional_ira_balance": {
                    "type": "number",
                    "description": "Current traditional IRA balance in dollars",
                },
                "timeline": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "year": {"type": "integer"},
                            "gross_income": {"type": "number"},
                            "drawdown": {
                                "type": "number",
                                "description": "Amount to draw from accounts this year. Omit if externally funded.",
                            },
                            "notes": {"type": "string", "default": ""},
                        },
                        "required": ["year", "gross_income"],
                    },
                    "description": "Year-by-year plan with income and optional drawdown amounts",
                },
                "drawdown_start_age": {
                    "type": "integer",
                    "description": "Age when account distributions begin (post-timeline fallback)",
                },
                "planning_horizon_age": {
                    "type": "integer",
                    "description": "Age at end of plan (terminal liquidation). Default 90.",
                },
                "default_drawdown": {
                    "type": "number",
                    "description": "Annual drawdown from accounts in post-timeline years. Defaults to 4% rule if omitted.",
                },
            },
            "required": [],
        },
    },
]
