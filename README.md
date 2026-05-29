# Lucerna

See your financial future clearly.

A Roth conversion optimizer that helps people in income transitions make tax-smart decisions, with AI-powered explanations.

## Repo Structure

```
lucerna/
├── frontend/          # Next.js 14+ (App Router) + TypeScript + Tailwind (→ Vercel)
│   └── src/
│       ├── components/    # calculator/, demo/, results/, methodology/, ui/, common/
│       ├── lib/api/       # Backend API client
│       ├── lib/types/     # Shared TypeScript types
│       └── lib/utils/     # Formatting, constants
├── backend/           # Python + FastAPI + Pydantic (→ Railway)
│   └── app/
│       ├── engine/        # Optimization engine (deterministic)
│       │   ├── types.py       # Pydantic models (ScenarioInput, OptimizationResult)
│       │   ├── tax.py         # Federal tax bracket calculator
│       │   ├── state_tax.py   # State income tax rates
│       │   ├── irmaa.py       # Medicare IRMAA surcharge calculator
│       │   ├── aca.py         # ACA premium tax credit calculator
│       │   ├── rmd.py         # Required minimum distribution calculator
│       │   ├── dp.py          # 3D DP optimizer (primary engine)
│       │   ├── heuristic.py   # Greedy bracket-fill initialization
│       │   ├── optimizer.py   # scipy SLSQP multi-year optimizer (fallback)
│       │   ├── trace.py       # Reasoning trace (engine → AI contract)
│       │   └── demo.py        # Margaret demo scenario
│       ├── api/           # FastAPI route handlers
│       └── ai/            # System prompt + tool definitions
├── e2e/               # Playwright end-to-end tests
├── docs/
│   ├── design-aesthetic.md    # Visual language, colors, typography, components
│   ├── planning/              # Project brief, execution plan, input variables spec
│   └── research/              # Market research, competitive analysis
├── .github/workflows/
│   ├── test.yml               # CI: backend → frontend → e2e
│   ├── deploy-backend.yml     # Railway deploy
│   └── deploy-frontend.yml    # Vercel deploy
└── README.md
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, Pydantic |
| AI | Anthropic Claude Sonnet (backend only) |
| Charts | ApexCharts + custom SVG bracket visualization |
| Frontend hosting | Vercel |
| Backend hosting | Railway |
| Analytics | PostHog |
| Observability | Prometheus + Grafana Cloud |

## Demo Scenario

Margaret, 63, married filing jointly. Retired early with a large traditional IRA. Ten-year timeline spanning her income valley (pre-Social Security), Social Security claiming, and the onset of RMDs at age 73. The optimizer places conversions in the low-income years before RMDs force taxable distributions.

## Development

```bash
# Install dependencies and set up git hooks
npm install

# Run both services in parallel
npm run dev

# Run all tests
npm run test:all

# Lint + format
npm run lint:all
npm run format:all
```

Individual commands:

```bash
npm run test:backend     # pytest
npm run test:frontend    # Vitest
npm run test:e2e         # Playwright

npm run lint:frontend    # ESLint
npm run lint:backend     # Ruff

npm run format:frontend  # Prettier
npm run format:backend   # Ruff format
```

## Docs

- [Project Brief](docs/planning/Lucerna_Project_Brief.md)
- [M1 Execution Plan](docs/planning/Lucerna_M1_Execution_Plan_Complete.md)
- [Input Variables Spec](docs/planning/Lucerna_Input_Variables_Spec.md)
- [Design Aesthetic](docs/design-aesthetic.md)
