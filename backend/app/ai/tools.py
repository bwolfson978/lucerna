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
            "'What if I retire at 60 instead of 65?'"
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
                "income_trajectory": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "year": {"type": "integer"},
                            "gross_income": {"type": "number"},
                            "life_event": {"type": "string", "default": "none"},
                        },
                        "required": ["year", "gross_income"],
                    },
                    "description": "Expected income for each year",
                },
                "retirement_age": {
                    "type": "integer",
                    "description": "Expected retirement age",
                },
            },
            "required": [],
        },
    },
]
