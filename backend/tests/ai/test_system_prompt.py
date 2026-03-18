"""Tests for the AI system prompt configuration.

Imports target app.ai.system_prompt which does not yet exist (RED state for TDD).
"""

from app.ai.system_prompt import SYSTEM_PROMPT


def test_system_prompt_is_string():
    """System prompt must be a non-empty string."""
    assert isinstance(SYSTEM_PROMPT, str)
    assert len(SYSTEM_PROMPT) > 0


def test_system_prompt_contains_educational_framing():
    """System prompt must include educational framing and disclaimers."""
    prompt_lower = SYSTEM_PROMPT.lower()
    has_educational = "educational" in prompt_lower
    has_disclaimer = "not financial advice" in prompt_lower
    assert has_educational or has_disclaimer, (
        "System prompt must contain 'educational' or 'not financial advice'"
    )
