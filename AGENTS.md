# Lucerna

Roth conversion optimizer — "See your financial future clearly."

## Agent setup

This file is the single set of instructions for any coding agent (Codex, Cursor, Copilot, Gemini CLI, Claude Code and others). `CLAUDE.md` only imports it. Repo skills live in `.agents/skills/<name>/SKILL.md` in the open Agent Skills format; `.claude/skills` is a symlink to the same folder so Claude Code finds them too. Add or change skills there, keep them tool-neutral (plain shell and scripts, no agent-specific tool names), and edit this file rather than `CLAUDE.md`.

## Before you start

On a fresh clone or machine, or when `node`, `npm`, `python` or a `node_modules` folder is missing, run the `setup-lucerna` skill (`.agents/skills/setup-lucerna/scripts/setup.sh`) before anything else, then `source .agents/skills/setup-lucerna/scripts/env.sh` in each new shell.

Read the current execution plan in `docs/planning/` and the project brief before starting work.
Ask the user which workstream or task they're picking up.

## Architecture

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind → deployed to Vercel
- **Backend:** Python, FastAPI, Pydantic → deployed to Railway
- **AI:** Anthropic Claude Sonnet, called from backend — never from frontend
- **Charts:** ApexCharts (standard charts) + custom SVG/HTML (bracket visualization, landing explainers)
- **Monorepo:** `frontend/` and `backend/` are independently deployable services

## Core principles

- **Deterministic engine + AI explanation layer.** The optimization engine does the math and produces a structured reasoning trace. The AI translates that trace into natural language. The AI never computes financial results.
- **Progressive disclosure.** Simplicity first, complexity on demand. Headline results up front; detailed analysis available on scroll/click.
- **One definition per card.** Cards shown both natively and in MCP App Views live in `ui/` (display-only React, shared Tailwind preset and tokens). The web app imports them; Views render them through preact/compat. Change the shared component, not a copy. See `docs/agent-and-mcp.md`.
- **Storybook is the component catalog.** Adding or changing a component in `ui/src/`, `components/ui/` or `components/common/` means adding or updating its stories in the same PR. See `docs/storybook.md`.
- **UI PRs show before and after.** A PR that changes `frontend/`, `ui/` or `mcp-views/` (or backend output the UI renders) carries side-by-side screenshots at desktop and phone width in its Before / After section, and the same images go in the chat message that says the PR is up. Use the `pr-evidence` skill; `run-lucerna` covers starting the app. Both live in `.agents/skills/`.
- **Mobile-first.** All UI must be responsive from the start — many users arrive from Reddit on phones.

## Design aesthetic

The current aesthetic is **"Paper & Pine"** — a light, editorial design with warm paper backgrounds, deep pine green (#1b4332) as the brand color, ember (#f26522) reserved for costs and danger, three-font typography (Playfair Display, Inter, IBM Plex Mono), and animated, interactive explainer diagrams. When working on any frontend code, follow the design spec in `docs/design-aesthetic.md`. It defines Lucerna's visual language — colors, typography, spacing, component patterns, chart styling, and anti-patterns. Read it before building or modifying UI.

## Design system
Paper & Pine: https://claude.ai/artifact/DmM5iwLcxeTE8rA6siDr1M
Before UI work, read its project/README.md and the README of each component you touch.
Source of truth for values stays in code: ui/tailwind/preset.js, ui/styles/tokens.css,
ui/src/colors.ts, docs/design-aesthetic.md. If you change those, say so, so the design
system can be re-synced.

## Frontend guidelines

The UI is for financially literate people who are not financial professionals. All backend and financial concepts must be translated into plain English before reaching the user:

- "Estimated lifetime tax savings" not "NPV" or "net present value"
- "Impact on after-tax wealth (today's dollars)" not "discounted cash flow"
- "Projected balance" not "terminal value"
- Show multiple scenarios and tradeoffs, not a single "optimal" directive
- **No emdashes (—) in user-facing copy.** They look AI-generated. Use commas, periods, colons, or rewrite the sentence instead. This applies to all visible text: headings, descriptions, tooltips, labels, placeholders. Code comments are fine.

The AI conversation layer must use educational framing (legal requirement):
- Never "you should" — use "the analysis shows" / "based on your inputs"
- Frame outputs as scenario analysis, not financial advice

## Backend guidelines

- All API inputs and outputs use Pydantic models
- **Settings:** the backend reads environment variables only through `app/config.py` (one typed `Settings` class, listed in `backend/.env.example`); the frontend gets the backend and site URLs from `src/lib/utils/constants.ts` (`API_URL`, `SITE_URL`). Add new backend settings to `Settings`, not as `os.environ` reads elsewhere.
- Engine code lives in `app/engine/`, API routes in `app/api/`, tools in `app/tools/`, the agent harness in `app/agent/`, the MCP server in `app/mcp/`
- **The MCP server is the single tool surface** (`app/mcp/server.py`, logic in `app/tools/`). The web agent (`POST /api/agent`) is an MCP client of it (`app/agent/toolbox.py`), so Claude, ChatGPT and the web app all use the same tools. Add a capability as an MCP tool; the web app gets it automatically. Only display concerns (the `show` tool, UI payloads via `_meta`) live in the web toolbox.
- **MCP Apps:** UI for tool results is owned by the MCP server as `ui://` Views (source in `mcp-views/`, built with `npm run build:views` into `backend/app/mcp/views/`, linked via `_meta.ui.resourceUri`). The web app is a host: it mounts Views through the sandbox proxy (`/mcp-apps/sandbox`) with the official `AppBridge` (`McpAppFrame.tsx`). The model never sees or writes UI. See `docs/agent-and-mcp.md`.
- The scenario draft (`app/tools/draft.py`) mirrors the calculator form; `frontend/src/lib/scenario/draft.ts` must stay in parity (shared fixtures in `shared/fixtures/`, regenerate with `python -m scripts.generate_draft_fixtures`)
- Methodology copy lives in `backend/app/content/methodology.json` with an identical copy at `frontend/src/content/methodology.json`
- The reasoning trace (`app/engine/trace.py`) is the contract between engine and AI — keep it structured and complete
- **Multi-year optimizer** is the only engine mode — `scipy.optimize.minimize` (SLSQP) with greedy bracket-fill heuristic as initialization and fallback. No separate single-year path; a 1-year timeline is just `len(income_timeline) == 1`.
- Engine files: `types.py` → `tax.py` → `heuristic.py` → `optimizer.py` → `trace.py` → `demo.py`

## Linting and formatting

- **Frontend:** ESLint 9 flat config (`frontend/eslint.config.mjs`) with `typescript-eslint`, `@next/eslint-plugin-next`, and `react-hooks` rules. Prettier (`frontend/.prettierrc`) handles formatting, including Tailwind class sorting. Configs are tuned to catch real bugs without nitpicking style.
- **Backend:** Ruff handles linting and formatting (config in `backend/pyproject.toml`). Replaces flake8/black/isort in a single tool. Rules: `E`, `F`, `W`, `I`, `UP`, `B`, `SIM`.
- **Pre-commit hooks:** husky + lint-staged auto-fix staged files and block commits with remaining errors. Setup runs automatically via `npm install` at the repo root (via the `prepare` script).
- **CI:** Both `test.yml` and the deploy workflows run lint and format checks before tests.

Commands (from repo root):
- `npm run lint:all` — lint both frontend and backend
- `npm run format:all` — autoformat both frontend and backend
- `npm run format:check` — check formatting without modifying files
- `npm run lint:frontend` / `npm run lint:backend` — scope to one service
- `npm run format:frontend` / `npm run format:backend` — scope to one service

If a pre-commit hook blocks you on something you believe is correct, fix the root cause rather than using `--no-verify`. The hook catches real issues; bypassing it pushes the problem to CI.

## Project structure

```
lucerna/
├── frontend/              # Next.js + TypeScript + Tailwind
│   ├── vitest.config.ts   # Vitest config (jsdom, @/ alias, 80% coverage)
│   └── src/
│       ├── components/    # Organized by feature (demo/, calculator/, chat/, etc.)
│       ├── lib/api/       # Backend API client
│       ├── lib/types/     # Shared TypeScript types
│       ├── lib/utils/     # Formatting, constants
│       └── test/          # Test setup, MSW mocks, fixtures
├── backend/               # Python + FastAPI
│   ├── pyproject.toml     # pytest config (asyncio_mode=auto, 80% coverage)
│   ├── app/
│   │   ├── main.py        # FastAPI app, CORS, health check
│   │   ├── engine/        # Optimization engine (deterministic)
│   │   │   ├── types.py   # Pydantic models (ScenarioInput, OptimizationResult)
│   │   │   ├── tax.py     # Federal tax bracket calculator
│   │   │   ├── heuristic.py # Greedy bracket-fill initialization
│   │   │   ├── optimizer.py # Multi-year NPV + scipy SLSQP optimizer
│   │   │   ├── trace.py   # Reasoning trace generator
│   │   │   └── demo.py    # Alex 3-year demo scenario
│   │   ├── api/           # FastAPI route handlers
│   │   ├── tools/         # Transport-neutral tools + scenario draft
│   │   ├── agent/         # Agent loop, system prompt, limits, demo conversation
│   │   └── mcp/           # Remote MCP server (/mcp)
│   └── tests/
│       ├── engine/        # Pure math tests (no mocks)
│       ├── api/           # Endpoint tests (httpx AsyncClient)
│       ├── tools/         # Tool + draft tests
│       ├── agent/         # Loop, limits, demo tests (scripted model clients)
│       └── mcp/           # MCP server tests
├── mcp-views/             # MCP App Views (TS → single-file HTML served by the MCP server)
├── ui/                    # Shared display components + Paper & Pine tokens/preset
│   ├── src/               # ResultCard, charts, ScenarioCompareCard, ScenarioSummary, MetricCard (no app context)
│   ├── tailwind/preset.js # Theme (used by frontend and mcp-views)
│   └── styles/tokens.css  # CSS variables + component classes
├── mcp-views/             # MCP App Views: entries around ui/ components, built into backend/app/mcp/views/
├── shared/fixtures/       # Cross-language fixtures (scenario draft, View data)
├── listing/               # Claude and ChatGPT directory listing kit: copy, test cases, screenshots, plugin ZIP build
├── e2e/                   # Playwright E2E tests (spans both services)
│   ├── playwright.config.ts
│   ├── capture/           # Before/after capture flows (pr-evidence skill)
│   ├── fixtures/          # test.ts: the `test` every spec imports (fails on uncaught page errors)
│   └── tests/
├── .agents/skills/         # Repo skills (Agent Skills format): setup-lucerna, run-lucerna, pr-evidence
├── .claude/skills          # Symlink to .agents/skills, for Claude Code
├── docs/
│   ├── design-aesthetic.md    # Visual language, colors, typography, components
│   ├── planning/              # Project brief, execution plans, input variables spec
│   └── research/              # Market research, competitive analysis
├── .github/workflows/test.yml # CI: backend → frontend → e2e
├── package.json               # Root scripts (test:backend, test:frontend, test:e2e, test:all)
├── AGENTS.md                  # This file: instructions for every coding agent
└── CLAUDE.md                  # Imports AGENTS.md for Claude Code
```

## Current scope boundaries

Check the active execution plan in `docs/planning/` for what's in scope for the current milestone. Don't build features from future milestones unless asked.

## GitHub CLI

When using `gh` commands, always pass the explicit `--repo bwolfson978/lucerna` flag
(or use `gh api repos/bwolfson978/lucerna/...`) rather than relying on the git remote
to infer the repository. This ensures commands work in all environments, including
Claude Code web sessions where the git remote points to a local proxy.

If `gh auth status` fails, check whether `GH_TOKEN` or `GITHUB_TOKEN` is set in
the environment before asking the user to authenticate.

## Git Operations

Any time you are starting an implementation by checking out a new feature branch, make sure you've pulled the most recent changes from master branch so you're building on top of them

## GitHub Issue Workflow

### For scout agents (filing issues)
- Always apply `status:open` and the appropriate `type:` label
- Write clear reproduction steps or rationale

### For builder agents (picking up issues)
- Only pick issues labeled `status:open`
- Immediately relabel to `status:claimed` before starting work
- When opening a PR, relabel to `status:in-review` and link the issue
- If blocked, relabel `status:blocked` and leave a comment explaining why

### Ingesting screenshots from GitHub issues
GitHub issue screenshots are hosted at `github.com/user-attachments/...` URLs that require authentication. To view them:

```bash
# 1. Extract image URL(s) from the issue body
IMG_URL=$(gh issue view <NUMBER> --json body -q .body | grep -oP 'https://[^ )"]+')

# 2. Download with authenticated gh api
gh api -H "Accept: application/octet-stream" "$IMG_URL" > issue_screenshot.png
```

Then use the Read tool on the downloaded `.png` — it renders images visually (multimodal). Always do this when an issue contains screenshots so you understand the full context before planning or implementing.

### Label reference
- status:open | status:claimed | status:in-review | status:done | status:blocked
- type:bug | type:improvement | type:refactor
- priority:high | priority:low