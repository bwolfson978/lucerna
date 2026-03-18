"""Tests for the AI tool definitions (Anthropic tool-use schema).

Imports target app.ai.tools which does not yet exist (RED state for TDD).
"""

from app.ai.tools import TOOLS


def test_tools_is_list():
    """TOOLS should be a list of tool definitions."""
    assert isinstance(TOOLS, list)
    assert len(TOOLS) > 0


def test_each_tool_has_required_fields():
    """Every tool definition must have name, description, and input_schema."""
    required_fields = ["name", "description", "input_schema"]
    for tool in TOOLS:
        for field in required_fields:
            assert field in tool, (
                f"Tool {tool.get('name', '<unnamed>')} missing required field: {field}"
            )
