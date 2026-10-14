"""Build the ChatGPT plugin ZIP from listing.json, and check every listing limit.

    python listing/build_plugin_zip.py              # check, then write dist/<name>-<version>.zip
    python listing/build_plugin_zip.py --check      # check only
    python listing/build_plugin_zip.py --out DIR    # write the ZIP somewhere else
    python listing/build_plugin_zip.py --draft      # build before the walkthrough video exists

Standard library only. The ZIP holds plugin.json, mcp.json, the get-started skill and the
logo; no secrets go in it. Limits follow OpenAI's plugin submission docs and Anthropic's
connector submission docs as of 2026-10-14 (see listing/README.md).
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
LOGO = "assets/logo-512.png"
SKILL = "openai/skills/get-started/SKILL.md"

CHATGPT_CATEGORIES = {
    "Productivity",
    "Creativity",
    "Developer Tools",
    "Business & Operations",
    "Data & Analytics",
    "Communication",
    "Education & Research",
    "Security",
    "Finance",
    "Healthcare",
    "Travel",
    "Entertainment",
    "Other",
}


def _luminance(hex_color: str) -> float:
    def channel(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def _contrast(a: str, b: str) -> float:
    hi, lo = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def load() -> tuple[dict, str]:
    listing = json.loads((HERE / "listing.json").read_text())
    description = (HERE / listing["descriptionFile"]).read_text().strip()
    return listing, description


def check(listing: dict, description: str, *, final: bool) -> list[str]:
    """Problems that would fail a form or the ZIP validator. Empty when all is well."""
    problems: list[str] = []

    def limit(label: str, text: str, most: int) -> None:
        if len(text) > most:
            problems.append(f"{label} is {len(text)} characters (limit {most})")
        if "—" in text:
            problems.append(f"{label} has an em dash")

    limit("Display name", listing["displayName"], 30)
    limit("ChatGPT short description", listing["shortDescription"], 30)
    # Anthropic's docs say 200; a third-party guide says the portal stops at 55.
    limit("Claude one-liner", listing["oneLiner"], 55)
    limit("Description (Claude's limit)", description, 2000)
    limit("Release notes", listing["releaseNotes"], 4000)
    limit("Developer name", listing["developerName"], 80)

    prompts = listing["examplePrompts"]
    if not 1 <= len(prompts) <= 3 or len(set(prompts)) != len(prompts):
        problems.append("Example prompts: 1 to 3, all different")
    for i, prompt in enumerate(prompts, 1):
        limit(f"Example prompt {i}", prompt, 128)
        if "@" in prompt:
            problems.append(f"Example prompt {i} has an @mention")

    if listing["categories"]["chatgpt"] not in CHATGPT_CATEGORIES:
        problems.append(f"ChatGPT category {listing['categories']['chatgpt']!r} is not allowed")
    if not 1 <= len(listing["categories"]["claude"]) <= 5:
        problems.append("Claude categories: one to five")

    for key, url in listing["urls"].items():
        if not url.startswith("https://") or len(url) > 1024:
            problems.append(f"URL {key} must be https and at most 1,024 characters")

    if _contrast(listing["brandColor"], "#ffffff") < 2:
        problems.append("brandColor needs 2:1 contrast against white")
    if _contrast(listing["brandColorDark"], "#212121") < 2:
        problems.append("brandColorDark needs 2:1 contrast against #212121")

    shots = listing["screenshots"]["claude"]
    if not 3 <= len(shots) <= 5:
        problems.append("Claude screenshots: 3 to 5")
    for shot in shots:
        path = HERE / shot["file"]
        if not path.exists():
            problems.append(f"Missing screenshot {shot['file']}")
        elif _png_width(path) < 1000:
            problems.append(f"{shot['file']} is narrower than 1,000px")

    cases = listing["testCases"]
    if len(cases["positive"]) != 5 or len(cases["negative"]) != 3:
        problems.append("Test cases: exactly 5 positive and 3 negative")
    for case in cases["positive"]:
        for field in ("description", "prompt", "tools_triggered", "expected_behavior"):
            if not case.get(field):
                problems.append(f"Positive test case is missing {field}: {case.get('prompt')!r}")
    for case in cases["positive"] + cases["negative"]:
        limit("Test case description", case["description"], 4000)

    if final and not listing["demoRecordingUrl"].startswith("https://"):
        problems.append("demoRecordingUrl is not set (record the walkthrough first)")
    return problems


def _png_width(path: Path) -> int:
    header = path.read_bytes()[:24]
    return int.from_bytes(header[16:20], "big")


def plugin_json(listing: dict, description: str) -> dict:
    urls = listing["urls"]
    cases = listing["testCases"]
    review: dict = {
        "test_cases": {
            "positive": [
                {k: c[k] for k in ("description", "prompt", "tools_triggered", "expected_behavior")}
                for c in cases["positive"]
            ],
            "negative": [{k: c[k] for k in ("description", "prompt")} for c in cases["negative"]],
        }
    }
    if listing["demoRecordingUrl"]:
        review["demo_recording_url"] = listing["demoRecordingUrl"]
    return {
        "$schema": PLUGIN_SCHEMA,
        "name": listing["name"],
        "version": listing["version"],
        "description": listing["oneLiner"],
        "author": {
            "name": listing["developerName"],
            "email": listing["supportEmail"],
            "url": urls["website"],
        },
        "homepage": urls["website"],
        "extensions": {
            "com.openai": {
                "interface": {
                    "displayName": listing["displayName"],
                    "shortDescription": listing["shortDescription"],
                    "longDescription": description,
                    "developerName": listing["developerName"],
                    "category": listing["categories"]["chatgpt"],
                    "websiteURL": urls["website"],
                    "supportURL": urls["support"],
                    "privacyPolicyURL": urls["privacyPolicy"],
                    "termsOfServiceURL": urls["termsOfService"],
                    "defaultPrompt": listing["examplePrompts"],
                    "brandColor": listing["brandColor"],
                    "brandColorDark": listing["brandColorDark"],
                    "logo": f"./{LOGO}",
                },
                "onboardingSkill": "./skills/get-started/SKILL.md",
                "review": review,
                "publication": {
                    "countries": listing["countries"],
                    "release_notes": listing["releaseNotes"],
                },
            }
        },
    }


def mcp_json(listing: dict) -> dict:
    # "mixed": the analysis tools work signed out; saving asks for OAuth sign-in (Clerk, DCR).
    return {
        "$schema": MCP_SCHEMA,
        "mcpServers": {
            listing["name"]: {
                "type": "streamable-http",
                "url": listing["serverUrl"],
                "extensions": {
                    "com.openai": {"auth": {"type": "mixed", "client": {"mode": "dcr"}}}
                },
            }
        },
    }


def build(listing: dict, description: str, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{listing['name']}-{listing['version']}.zip"
    files = {
        "plugin.json": json.dumps(plugin_json(listing, description), indent=2) + "\n",
        "mcp.json": json.dumps(mcp_json(listing), indent=2) + "\n",
        "skills/get-started/SKILL.md": (HERE / SKILL).read_text(),
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, text in files.items():
            zf.writestr(name, text)
        zf.write(HERE / LOGO, LOGO)
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="check limits only")
    parser.add_argument("--draft", action="store_true", help="allow a missing video link")
    parser.add_argument("--out", type=Path, default=HERE / "dist", help="where to write the ZIP")
    args = parser.parse_args()

    listing, description = load()
    problems = check(listing, description, final=not (args.check or args.draft))
    for problem in problems:
        print(f"- {problem}", file=sys.stderr)
    if args.check:
        print("Listing checks passed." if not problems else f"{len(problems)} problem(s).")
        return 1 if problems else 0
    if problems:
        print("Not building: fix the problems above.", file=sys.stderr)
        return 1
    print(build(listing, description, args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
