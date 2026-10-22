"""The landing hero's households must match what the engine computes today."""

import json

from scripts.generate_landing_situations import OUTPUT, build


def test_fixture_matches_engine():
    committed = json.loads(OUTPUT.read_text())
    assert build() == committed, (
        "shared/fixtures/landing-situations.json is stale: "
        "run `python -m scripts.generate_landing_situations` from backend/"
    )
