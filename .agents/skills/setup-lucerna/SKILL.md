---
name: setup-lucerna
description: Set up a fresh Lucerna checkout or machine (Node 20, Python 3.11 via uv, backend virtualenv, npm packages, git hooks) with one script, and put those tools on PATH. Use on a new clone, a new laptop, or whenever node, npm, python, uvicorn, ruff or a node_modules folder is missing, before running checks, run-lucerna or pr-evidence.
---

# Set up Lucerna

One script takes a fresh clone to "lint, tests and the app all run". It works on macOS and
Linux, needs no sudo or Homebrew, and skips every step that is already done, so it is safe
to re-run after pulling (for example when a lockfile changed).

```bash
.agents/skills/setup-lucerna/scripts/setup.sh            # install what's missing
.agents/skills/setup-lucerna/scripts/setup.sh --check    # report only; non-zero if anything is missing
source .agents/skills/setup-lucerna/scripts/env.sh       # put the tools on PATH in this shell
```

## What it sets up

| Piece | Where | Notes |
| --- | --- | --- |
| Node 20+ | the one on PATH, else `~/.local/node` | Latest Node 20 from nodejs.org, SHA-256 checked |
| uv | the one on PATH, else `~/.local/bin` | From Astral's GitHub release, SHA-256 checked. Supplies Python 3.11 |
| Backend virtualenv | `backend/.venv` | Python 3.11, `requirements-dev.txt` (includes Pillow for pr-evidence), app installed editable |
| npm packages | root, `frontend/`, `e2e/`, `mcp-views/` | `npm ci` from the lockfiles. The root install sets up the husky pre-commit hook |

It never edits shell profiles. `env.sh` prepends `backend/.venv/bin`, `~/.local/node/bin` and
`~/.local/bin` to PATH when they exist, and sets `PW_CHROMIUM_PATH` to the cloud image's
Chromium or, on macOS, Google Chrome. `run-lucerna` and `pr-evidence` source it themselves,
so their scripts work right after setup without any PATH changes. Source it yourself before
running `npm`, `ruff`, `pytest` or `uvicorn` directly. A person who wants the tools in every
terminal can add the `source` line to their shell profile; ask before doing that for them.

## Rules

- Downloads come only from nodejs.org and Astral's GitHub releases, and only when the tool is
  missing. Tell the person before running a setup that will download, and say what it will
  fetch (`--check` shows it).
- Never run `playwright install`. Screenshots use the browser `env.sh` finds; if none is
  found, say so rather than downloading one.
- If a step fails, read its output: the usual causes are no network (re-run later) or a
  Python package that needs a newer `uv` (delete `~/.local/bin/uv` and re-run).

## After setup

- Checks CI runs: `npm run lint:all`, `npm run format:check`, `npm run test:frontend`,
  `npm run test:backend` from the repo root.
- If you changed `ui/` or `mcp-views/`, run `npm run build:views` and commit
  `backend/app/mcp/views/`: CI fails when the built Views don't match their source.
- Run the app with `run-lucerna`; capture before/after screenshots with `pr-evidence`.
