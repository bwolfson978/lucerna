"""Tests for the demo scenario module."""

from app.engine.demo import get_demo, DEMO_SCENARIO, DEMO_PERSONA
from app.engine.types import ScenarioInput, OptimizationResult


class TestDemoScenario:
    def test_demo_scenario_is_scenario_input(self):
        assert isinstance(DEMO_SCENARIO, ScenarioInput)

    def test_demo_has_full_trajectory(self):
        assert len(DEMO_SCENARIO.income_trajectory) == 27

    def test_demo_persona_has_name(self):
        assert DEMO_PERSONA["name"] == "Alex"

    def test_demo_persona_has_required_fields(self):
        assert "age" in DEMO_PERSONA
        assert "occupation" in DEMO_PERSONA
        assert "situation" in DEMO_PERSONA

    def test_get_demo_returns_persona_and_result(self):
        demo = get_demo()
        assert "persona" in demo
        assert "input" in demo
        assert "result" in demo
        assert isinstance(demo["result"], OptimizationResult)

    def test_get_demo_result_has_matching_conversions(self):
        demo = get_demo()
        assert len(demo["result"].yearly_conversions) == len(DEMO_SCENARIO.income_trajectory)
