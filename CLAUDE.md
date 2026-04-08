# Lucerna

Roth conversion optimizer — "See your financial future clearly."

## Before you start

Read the current execution plan in `docs/planning/` and the project brief before starting work.
Ask the user which workstream or task they're picking up.

## Architecture

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind → deployed to Vercel
- **Backend:** Python, FastAPI, Pydantic → deployed to Railway
- **AI:** Anthropic Claude Sonnet, called from backend — never from frontend
- **Charts:** ApexCharts (standard charts) + custom SVG (bracket visualization)
- **Monorepo:** `frontend/` and `backend/` are independently deployable services

## Core principles

- **Deterministic engine + AI explanation layer.** The optimization engine does the math and produces a structured reasoning trace. The AI translates that trace into natural language. The AI never computes financial results.
- **Progressive disclosure.** Simplicity first, complexity on demand. Headline results up front; detailed analysis available on scroll/click.
- **Mobile-first.** All UI must be responsive from the start — many users arrive from Reddit on phones.

## Design aesthetic

The current aesthetic is **"Warm Midnight"** — a dark-mode, warm, premium design with glassmorphic cards, gold accents (#F0C674), and four-font typography (DM Serif Display, DM Sans, Inter, Manrope). When working on any frontend code, follow the design spec in `docs/design-aesthetic.md`. It defines Lucerna's visual language — colors, typography, spacing, component patterns, chart styling, and anti-patterns. Read it before building or modifying UI.

## Frontend guidelines

The UI is for financially literate people who are not financial professionals. All backend and financial concepts must be translated into plain English before reaching the user:

- "Estimated lifetime tax savings" not "NPV" or "net present value"
- "Impact on after-tax wealth (today's dollars)" not "discounted cash flow"
- "Projected balance" not "terminal value"
- Show multiple scenarios and tradeoffs, not a single "optimal" directive

The AI conversation layer must use educational framing (legal requirement):
- Never "you should" — use "the analysis shows" / "based on your inputs"
- Frame outputs as scenario analysis, not financial advice

## Backend guidelines

- All API inputs and outputs use Pydantic models
- Engine code lives in `app/engine/`, API routes in `app/api/`, AI layer in `app/ai/`
- The reasoning trace (`app/engine/trace.py`) is the contract between engine and AI — keep it structured and complete
- **Multi-year optimizer** is the only engine mode — `scipy.optimize.minimize` (SLSQP) with greedy bracket-fill heuristic as initialization and fallback. No separate single-year path; a 1-year timeline is just `len(income_timeline) == 1`.
- Engine files: `types.py` → `tax.py` → `heuristic.py` → `optimizer.py` → `trace.py` → `demo.py`

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
│   │   └── ai/            # System prompt, tool definitions
│   └── tests/
│       ├── engine/        # Pure math tests (no mocks)
│       ├── api/           # Endpoint tests (httpx AsyncClient)
│       └── ai/            # Prompt/tool schema tests (mocked SDK)
├── e2e/                   # Playwright E2E tests (spans both services)
│   ├── playwright.config.ts
│   ├── fixtures/
│   └── tests/
├── docs/
│   ├── design-aesthetic.md    # Visual language, colors, typography, components
│   ├── planning/              # Project brief, execution plans, input variables spec
│   └── research/              # Market research, competitive analysis
├── .github/workflows/test.yml # CI: backend → frontend → e2e
├── package.json               # Root scripts (test:backend, test:frontend, test:e2e, test:all)
└── CLAUDE.md
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