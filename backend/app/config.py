"""Every setting the backend reads from its environment, in one place.

Railway sets these in production; locally they come from the shell (see
``backend/.env.example`` for the full list). Values are read each time
``settings()`` is called, so a changed variable (or a test's monkeypatch) is
picked up without a restart. ``app.main`` reads them once at import, so a value
that doesn't parse stops the server from starting instead of failing a request.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The website's canonical origin. The bare domain only redirects here.
DEFAULT_SITE_URL = "https://www.rothconversionsoptimizer.com"


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        str_strip_whitespace=True, env_ignore_empty=True, extra="ignore"
    )

    # --- Website ----------------------------------------------------------------
    # Links handed to chats, the connector's website and icons, and the root redirect.
    site_url: str = DEFAULT_SITE_URL
    # Comma-separated frontend origins allowed by CORS. Empty means localhost only.
    allowed_origins: str = ""

    # --- Storage and operations -------------------------------------------------
    database_url: str = ""  # empty: scenario endpoints return 503
    metrics_token: str = ""  # empty: /metrics is open (local dev)
    openai_apps_challenge: str = ""  # OpenAI plugin portal domain check
    railway_environment_name: str = "local"
    railway_git_commit_sha: str = ""

    # --- Sign-in (Clerk) --------------------------------------------------------
    clerk_jwks_url: str = ""  # comma-separated JWKS URLs
    clerk_secret_key: str = ""  # Backend API, for account deletion

    # --- MCP server ---------------------------------------------------------------
    mcp_auth_issuer: str = ""  # empty: OAuth for save/list/open tools is off
    mcp_auth_scopes: str = "profile email"
    mcp_internal_token: str = ""
    mcp_analyses_per_ip_per_day: int = 25
    mcp_analyses_per_user_per_day: int = 100
    mcp_anonymous_analyses_per_day: int = 3000
    mcp_max_concurrent_analyses: int = 2
    mcp_analysis_queue_seconds: float = 10.0

    # --- Website assistant ------------------------------------------------------
    anthropic_api_key: str = ""
    lucerna_anthropic_api_key: str = ""  # used when ANTHROPIC_API_KEY is taken
    anthropic_auth_token: str = ""
    agent_model: str = "claude-sonnet-5-5"
    agent_effort: str = "medium"
    agent_offline: bool = False  # scripted replies, no model calls
    agent_mcp_url: str = ""  # empty: tools run in process
    agent_cache_dir: Path = Path(__file__).resolve().parents[1] / ".cache"
    agent_messages_per_conversation: int = 20
    agent_messages_per_ip_per_day: int = 60
    agent_daily_spend_usd: float = 50.0

    # --- Feedback and analytics (PostHog) ---------------------------------------
    feedback_per_caller_per_day: int = 10
    feedback_per_day: int = 500
    posthog_project_token: str = ""  # empty: error tracking and events are off
    posthog_host: str = "https://us.i.posthog.com"
    posthog_personal_api_key: str = ""  # data deletion
    posthog_project_id: str = ""
    posthog_api_host: str = "https://us.posthog.com"

    @property
    def site_origin(self) -> str:
        return self.site_url.rstrip("/")

    @property
    def allowed_origin_list(self) -> list[str]:
        return _csv(self.allowed_origins)

    @property
    def clerk_jwks_urls(self) -> list[str]:
        return _csv(self.clerk_jwks_url)


def settings() -> Settings:
    return Settings()
