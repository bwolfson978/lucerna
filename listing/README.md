# Directory listings

Everything the Claude connector directory and the ChatGPT plugin directory show or ask for. The repo is the source of truth: change copy here, then rebuild the ChatGPT ZIP from it.

| File | What it is |
| --- | --- |
| `listing.json` | Names, one-liners, categories, URLs, example prompts, screenshot prompts, release notes and the ChatGPT test cases (with what each returned on the live server) |
| `description.md` | The long description, shared by both directories |
| `reviewer.md` | Reviewer account and the text for Claude's "Test and launch" and ChatGPT's "Review details" (no password: that lives in Railway as `REVIEWER_PASSWORD`) |
| `video-script.md` | Walkthrough script for the ChatGPT review video |
| `assets/` | The icon: `logo.svg` (square, 64px viewBox) and `logo-512.png`, the same mark the MCP server and website use |
| `screenshots/claude/` | Claude carousel PNGs (at least 1,000px wide, card only); each one's prompt is in `listing.json` |
| `openai/skills/get-started/` | The skill that goes in the ChatGPT ZIP (OpenAI rejects a ZIP with no skill) |
| `build_plugin_zip.py` | Checks every limit and builds the ChatGPT plugin ZIP into `dist/` |

## Build the ChatGPT ZIP

```bash
python listing/build_plugin_zip.py --check   # limits only
python listing/build_plugin_zip.py --draft   # build without the video link
python listing/build_plugin_zip.py           # final build; needs demoRecordingUrl in listing.json
```

The ZIP holds `plugin.json`, `mcp.json` (the server at https://mcp.rothconversionsoptimizer.com/mcp, auth `mixed` with DCR: analysis works signed out, saving signs in), the get-started skill and the logo. It never holds secrets. Bump `version` in `listing.json` for every resubmission.

## Limits checked

From OpenAI's [plugin submission docs](https://developers.openai.com/plugins/deploy/submission) and [submission errors](https://developers.openai.com/plugins/deploy/submission-errors), and Anthropic's [connector submission docs](https://claude.com/docs/connectors/building/submission), as of 2026-10-14:

- ChatGPT: display name and short description 30 characters, long description 4,000, up to 3 example prompts of 128, one category from a fixed list, exactly 5 positive and 3 negative test cases, a demo video link, release notes.
- Claude: name 100, one-liner 200 (kept under 55, since the portal may cut it there), description 2,000, 1 to 5 categories, 3 to 5 carousel screenshots at least 1,000px wide with a prompt each.
