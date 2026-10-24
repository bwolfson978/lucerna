# Roth Conversions Optimizer

Multi-year Roth conversion planning for the in-between years: sabbaticals, career changes, starting a business, and early retirement before required minimum distributions.

- **Website:** https://www.rothconversionsoptimizer.com
- **MCP server (Claude, ChatGPT, any MCP client):** https://mcp.rothconversionsoptimizer.com/mcp

People describe their situation in a conversation (or a form), and the app finds how much to convert to Roth each year so that lifetime taxes are lowest. Results show the schedule, the tax brackets each conversion fills, and the tradeoffs, in today's dollars. The same tools run inside Claude and ChatGPT through the MCP server.

The codebase still uses the original project name, **Lucerna**, in package names, paths and docs.

## How it works

- **Deterministic engine, AI explanation.** The engine in `backend/app/engine/` does all the math: federal and state income tax, IRMAA, ACA premium credits, RMDs, Social Security and inflation. It produces a structured reasoning trace, and the model only turns that trace into plain English. The model never computes financial results.
- **Optimizer.** A dynamic programming search over yearly conversion amounts (`dp.py`) finds the schedule with the highest after-tax wealth. When the user sets limits (a cap per year, a bracket ceiling), SLSQP (`optimizer.py`) solves the constrained version, and a bracket-fill curve (`curve_strategy.py`) checks the result.
- **One tool surface.** The MCP server (`backend/app/mcp/`, tool logic in `backend/app/tools/`) is the only place tools are defined. The website's assistant is an MCP client of it, so the web app, Claude and ChatGPT all call the same tools.
- **MCP Apps.** Result cards are MCP App Views owned by the server (`mcp-views/`, built into `backend/app/mcp/views/`). They are built from the same React components in `ui/` that the website renders natively.

See [docs/agent-and-mcp.md](docs/agent-and-mcp.md) for the full agent and MCP design.

## Architecture

```
                 ┌──────────────────────────┐
 Browser ───────▶│ frontend/  Next.js       │  Vercel
                 │ (App Router, Tailwind)   │
                 └────────────┬─────────────┘
                              │ REST + SSE (/api/*)
                 ┌────────────▼─────────────┐
 Claude ────────▶│ backend/  FastAPI        │  Railway
 ChatGPT ───────▶│  /mcp     MCP server     │──▶ Anthropic API (website assistant)
                 │  /api     web API, agent │──▶ Postgres (saved scenarios)
                 │  engine   optimizer      │──▶ PostHog (analytics, feedback)
                 └──────────────────────────┘
```

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, ApexCharts plus custom SVG |
| Shared UI | `ui/`: display-only React components and the Paper & Pine theme |
| Backend | Python, FastAPI, Pydantic, SciPy |
| AI | Anthropic Claude Sonnet, called only from the backend |
| MCP | Streamable HTTP server with MCP Apps Views and lazy OAuth sign-in |
| Auth | Clerk (website sign-in and OAuth for the MCP account tools) |
| Database | Postgres (saved scenarios) |
| Analytics and feedback | PostHog |
| Hosting | Vercel (frontend, Storybook), Railway (backend) |
| Secrets | Doppler |

## Getting started

Requirements: Node 20 and Python 3.11 or newer. The setup script installs both locally if they are missing (no sudo), creates `backend/.venv`, installs npm packages and sets up git hooks.

```bash
.agents/skills/setup-lucerna/scripts/setup.sh
source .agents/skills/setup-lucerna/scripts/env.sh   # put the tools on PATH in each new shell

npm run dev   # backend on :8000 and frontend on :3000
```

Everything is optional locally. Without keys, sign-in, saved scenarios and analytics are off, and the rest of the app works. To run the assistant without an Anthropic key, start the backend with the offline stand-in, a rule-based replacement for the model:

```bash
cd backend && AGENT_OFFLINE=1 uvicorn app.main:app --reload --port 8000
```

`.agents/skills/run-lucerna/scripts/start.sh` does all of this in one step (offline agent, Clerk and PostHog off) and can run several checkouts side by side on different ports.

### Configuration

- **Backend:** every environment variable is declared once in `backend/app/config.py` and listed with its default in [`backend/.env.example`](backend/.env.example). Invalid values stop startup.
- **Frontend:** the backend and site URLs come from `frontend/src/lib/utils/constants.ts` (`API_URL` reads `NEXT_PUBLIC_API_URL`, default `http://localhost:8000`). Clerk and PostHog turn on when their `NEXT_PUBLIC_` keys are set.

### Connecting an MCP client to a local backend

Point any MCP client at `http://localhost:8000/mcp`, for example `npx @modelcontextprotocol/inspector`. After changing anything in `mcp-views/` or `ui/`, rebuild the Views with `npm run build:views`; CI fails if the built Views are out of date.

## Testing and linting

```bash
npm run test:backend    # pytest (engine, API, tools, agent, MCP)
npm run test:frontend   # Vitest
npm run test:e2e        # Playwright across both services (offline agent)
npm run test:all        # backend, frontend and the E2E smoke test

npm run lint:all        # ESLint and Ruff
npm run format:all      # Prettier and Ruff format
npm run format:check
```

Agent evals (scripted conversations with deterministic checks) live in `backend/evals/`:

```bash
cd backend
python -m evals.run_agent_evals --offline   # harness smoke test
python -m evals.run_agent_evals             # live model, spends API credit
```

Storybook is the component catalog: `cd frontend && npm run storybook`. See [docs/storybook.md](docs/storybook.md).

Pre-commit hooks (husky and lint-staged) fix staged files and block commits with remaining errors. CI (`.github/workflows/test.yml`) runs lint, format checks, the Views build check, backend and frontend tests, then E2E.

## Deployment

| Service | Host | Deploys when |
|---|---|---|
| Frontend | Vercel | A push to `master` touches `frontend/` or `ui/` (`deploy-frontend.yml`). PRs get preview deployments. |
| Storybook | Vercel | Preview builds for PRs that change components. |
| Backend and MCP server | Railway | A push to `master` touches `backend/` (`deploy-backend.yml`), after tests pass. |

Production secrets live in Doppler, the source of truth for the values set in Railway and Vercel. Never commit secrets; add a new backend setting to `Settings` in `app/config.py` and to `backend/.env.example`.

Tax data (federal and state brackets in `backend/data/`) is updated once a year with the `Update Tax Data` workflow. See [docs/tax-data-update.md](docs/tax-data-update.md).

## Repository layout

```
frontend/      Next.js web app
backend/       FastAPI service: engine/, api/, tools/, agent/, mcp/, db/
ui/            Shared display components and Paper & Pine tokens
mcp-views/     MCP App Views, built into backend/app/mcp/views/
shared/        Cross-language fixtures (scenario draft, View data)
e2e/           Playwright tests and before/after capture flows
listing/       Claude and ChatGPT directory listing kit
docs/          Design, architecture and process docs
.agents/       Repo skills for coding agents (setup, run, PR evidence)
```

## Documentation

- [AGENTS.md](AGENTS.md): conventions and instructions for contributors and coding agents
- [docs/agent-and-mcp.md](docs/agent-and-mcp.md): website assistant, MCP server, MCP Apps, limits and analytics
- [docs/design-aesthetic.md](docs/design-aesthetic.md): Paper & Pine visual language
- [docs/storybook.md](docs/storybook.md): component catalog
- [docs/tax-data-update.md](docs/tax-data-update.md): yearly tax data update
- [listing/README.md](listing/README.md): directory listing kit
- [docs/research/](docs/research/): market research and risk analysis

## Disclaimer

Roth Conversions Optimizer provides scenario analysis for educational purposes. It is not financial, tax or legal advice.
