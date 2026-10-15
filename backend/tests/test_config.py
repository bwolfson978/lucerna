import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings, settings

APP = Path(__file__).resolve().parents[1] / "app"


def test_defaults():
    config = Settings(_env_file=None)
    assert config.site_origin == "https://www.rothconversionsoptimizer.com"
    assert config.allowed_origin_list == []
    assert config.mcp_analyses_per_ip_per_day == 25
    assert config.agent_offline is False


def test_reads_environment_each_call(monkeypatch):
    monkeypatch.setenv("SITE_URL", "https://example.com/")
    monkeypatch.setenv("ALLOWED_ORIGINS", " https://a.test, ,https://b.test ")
    monkeypatch.setenv("MCP_ANALYSES_PER_IP_PER_DAY", "100")
    monkeypatch.setenv("AGENT_OFFLINE", "1")
    config = settings()
    assert config.site_origin == "https://example.com"
    assert config.allowed_origin_list == ["https://a.test", "https://b.test"]
    assert config.mcp_analyses_per_ip_per_day == 100
    assert config.agent_offline is True


def test_empty_values_fall_back_to_defaults(monkeypatch):
    monkeypatch.setenv("POSTHOG_HOST", "")
    monkeypatch.setenv("FEEDBACK_PER_DAY", "")
    assert settings().posthog_host == "https://us.i.posthog.com"
    assert settings().feedback_per_day == 500


def test_bad_value_is_an_error(monkeypatch):
    monkeypatch.setenv("MCP_MAX_CONCURRENT_ANALYSES", "lots")
    with pytest.raises(ValidationError):
        settings()


def test_only_config_reads_the_environment():
    readers = [
        path.relative_to(APP).as_posix()
        for path in APP.rglob("*.py")
        if re.search(r"os\.environ|os\.getenv", path.read_text())
    ]
    assert readers == []


def test_env_example_lists_every_setting():
    example = (APP.parent / ".env.example").read_text()
    listed = set(re.findall(r"^([A-Z][A-Z0-9_]*)=", example, re.M))
    declared = {name.upper() for name in Settings.model_fields}
    assert declared == listed
