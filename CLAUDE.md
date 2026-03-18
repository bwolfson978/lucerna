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

When working on any frontend code, follow the design spec in `docs/design-aesthetic.md`. It defines Lucerna's visual language — colors, typography, spacing, component patterns, chart styling, and anti-patterns. Read it before building or modifying UI.

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
- **Multi-year optimizer** is the only engine mode — `scipy.optimize.minimize` (SLSQP) with greedy bracket-fill heuristic as initialization and fallback. No separate single-year path; a 1-year trajectory is just `len(income_trajectory) == 1`.
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
