"""Model access for the agent loop.

``ModelClient`` is the seam between the loop and the Anthropic API: the loop asks
for one streamed model turn at a time and receives text deltas, tool-start
notices and the final assistant message as plain dicts. Tests and offline
development swap in other implementations.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Protocol

MODEL = os.environ.get("AGENT_MODEL", "claude-sonnet-5-5")
EFFORT = os.environ.get("AGENT_EFFORT", "medium")
MAX_TOKENS = 16000

# Server-side refusal fallback: the API re-runs a declined request on a suitable
# model inside the same call.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


@dataclass
class ModelTurn:
    content: list[dict]
    stop_reason: str | None
    usage: dict = field(default_factory=dict)
    model: str = MODEL


@dataclass
class TextDelta:
    text: str


@dataclass
class ToolStart:
    name: str


@dataclass
class Final:
    turn: ModelTurn


StreamEvent = TextDelta | ToolStart | Final


def api_key() -> str | None:
    """The Anthropic API key.

    ``LUCERNA_ANTHROPIC_API_KEY`` is a fallback for environments that reserve
    ``ANTHROPIC_API_KEY``, such as Claude Code cloud sessions.
    """
    return os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("LUCERNA_ANTHROPIC_API_KEY")


def has_credentials() -> bool:
    return bool(api_key() or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


class ModelUnavailable(Exception):
    """The model can't be reached (no key, outage, rate limit). The UI falls back to the form."""


class ModelClient(Protocol):
    def stream(
        self, *, system: str, tools: list[dict], messages: list[dict]
    ) -> AsyncIterator[StreamEvent]: ...


class AnthropicModelClient:
    def __init__(self) -> None:
        import anthropic

        self._anthropic = anthropic
        self._client = anthropic.AsyncAnthropic(api_key=api_key(), timeout=120.0, max_retries=2)

    async def stream(
        self, *, system: str, tools: list[dict], messages: list[dict]
    ) -> AsyncIterator[StreamEvent]:
        anthropic = self._anthropic
        try:
            async with self._client.beta.messages.stream(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=system,
                tools=tools,
                messages=messages,
                output_config={"effort": EFFORT},
                cache_control={"type": "ephemeral"},
                betas=[_FALLBACK_BETA],
                fallbacks="default",
            ) as stream:
                async for event in stream:
                    if event.type == "text":
                        yield TextDelta(event.text)
                    elif (
                        event.type == "content_block_start"
                        and event.content_block.type == "tool_use"
                    ):
                        yield ToolStart(event.content_block.name)
                final = await stream.get_final_message()
        except (
            anthropic.AuthenticationError,
            anthropic.PermissionDeniedError,
            anthropic.RateLimitError,
            anthropic.APIConnectionError,
        ) as err:
            raise ModelUnavailable(type(err).__name__) from err
        except anthropic.APIStatusError as err:
            if err.status_code >= 500 or err.status_code == 529:
                raise ModelUnavailable(f"status {err.status_code}") from err
            raise

        usage = final.usage.to_dict(mode="json") if final.usage else {}
        yield Final(
            ModelTurn(
                content=[block.to_dict(mode="json") for block in final.content],
                stop_reason=final.stop_reason,
                usage=usage,
                model=final.model,
            )
        )


_default_client: ModelClient | None = None


def get_model_client() -> ModelClient:
    """The process-wide model client. Raises ModelUnavailable when none is configured."""
    global _default_client
    if _default_client is not None:
        return _default_client
    if os.environ.get("AGENT_OFFLINE") == "1":
        from app.agent.offline import OfflineModelClient

        _default_client = OfflineModelClient()
        return _default_client
    if not has_credentials():
        raise ModelUnavailable("No Anthropic credentials configured")
    _default_client = AnthropicModelClient()
    return _default_client


def set_model_client(client: ModelClient | None) -> None:
    """Override the client (tests, offline development)."""
    global _default_client
    _default_client = client
