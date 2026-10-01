"""Links from a tool result to the full interactive results on the website.

A result id alone can't be opened elsewhere (results aren't stored), so the link
carries the scenario itself, compactly encoded. The site sends it to
POST /api/scenario-links/open (app/api/scenario_links.py), which rebuilds the
scenario, runs it and returns the full result.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from urllib.parse import urlencode

# Encoded scenarios are a few hundred characters; anything far beyond is not ours.
MAX_PARAM_LENGTH = 8000


def site_url() -> str:
    return os.environ.get("SITE_URL", "https://rothconversionsoptimizer.com").rstrip("/")


def encode_scenario(scenario: dict) -> str:
    raw = json.dumps(scenario, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def decode_scenario(param: str) -> dict:
    """The scenario in a link parameter. Raises ValueError if it isn't one."""
    if not param or len(param) > MAX_PARAM_LENGTH:
        raise ValueError("Missing or oversized scenario.")
    try:
        raw = base64.urlsafe_b64decode(param + "=" * (-len(param) % 4))
        data = json.loads(raw)
    except (binascii.Error, ValueError, UnicodeDecodeError) as err:
        raise ValueError("Unreadable scenario link.") from err
    if not isinstance(data, dict):
        raise ValueError("Unreadable scenario link.")
    return data


def full_results_url(scenario: dict, result_id: str, label: str | None = None) -> str:
    """The website's full results page for a scenario. `result` lets a host that already
    has the result open it directly; `scenario` lets anyone else recompute it."""
    params = {"view": "results", "result": result_id, "scenario": encode_scenario(scenario)}
    if label:
        params["label"] = label
    return f"{site_url()}/calculator?{urlencode(params)}"
