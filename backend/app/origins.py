"""Frontend origins allowed to call the API and to embed MCP App sandboxes."""

from __future__ import annotations

import os
import re

DEFAULT_ORIGINS = ["http://localhost:3000"]
ORIGIN_REGEX = r"https://(lucerna-.*\.vercel\.app|(www\.)?rothconversionsoptimizer\.com)"


def allowed_origins() -> list[str]:
    configured = os.environ.get("ALLOWED_ORIGINS", "")
    if configured:
        return [o.strip() for o in configured.split(",") if o.strip()]
    return list(DEFAULT_ORIGINS)


def is_allowed_origin(origin: str) -> bool:
    return origin in allowed_origins() or re.fullmatch(ORIGIN_REGEX, origin) is not None
