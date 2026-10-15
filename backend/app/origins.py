"""Frontend origins allowed to call the API and to embed MCP App sandboxes."""

from __future__ import annotations

import re

from app.config import settings

DEFAULT_ORIGINS = ["http://localhost:3000"]
ORIGIN_REGEX = r"https://(lucerna-.*\.vercel\.app|(www\.)?rothconversionsoptimizer\.com)"


def allowed_origins() -> list[str]:
    return settings().allowed_origin_list or list(DEFAULT_ORIGINS)


def is_allowed_origin(origin: str) -> bool:
    return origin in allowed_origins() or re.fullmatch(ORIGIN_REGEX, origin) is not None
