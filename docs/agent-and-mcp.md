# Conversational Agent and MCP Server

How the assistant on `/calculator` and `/demo` works, how to run it, and how to connect the remote MCP server to Claude, ChatGPT or other MCP clients.

## Architecture

```
frontend (Next.js)                         backend (FastAPI)
  ScenarioWorkspace                          POST /api/agent ── app/agent (loop, prompt, limits, demo)
    conversation ⇄ form (shared draft)                             │  MCP client (in process, or
    full results view (?view=results)                              │  HTTP when AGENT_MCP_URL is set)
                                                                   ▼
  Claude / ChatGPT / any MCP client ───────────────────────▶ /mcp  app/mcp/server.py
                                                               record_scenario
                                                               analyze_roth_conversions
                                                               compare_roth_scenarios
                                                               get_tax_brackets
                                                               explain_methodology
                                                               (+ methodology:// resources)
                                                                   │
                                                             app/tools (core logic, scenario draft)
                                                                   │
                                                             app/engine (optimizer, trace)
```

- **One tool surface.** The MCP server is the only place tools are defined. The web assistant is an MCP client of it, so every web conversation exercises exactly what a Claude connector or ChatGPT app gets: the same tool list, descriptions, schemas, errors and results.
- **Stateless tools.** Each call carries the whole scenario and returns the normalized `scenario` to pass next time. Per-year differences from the projection travel as `income_changes`. The browser's draft converts to and from this format (`core.scenario_from_draft` / `core.draft_from_scenario`).
- **Web-only extras stay outside MCP:** the `show` tool (cards, charts, follow-up chips) runs in the web loop, and full engine results for the UI are requested per call with `_meta: {"lucerna/ui": true}` and returned in the result's `_meta` under `lucerna/results`, never in what a model sees.
- The engine does all the math. Cards and charts render engine results directly, never numbers the model wrote.

## MCP Apps: who owns the UI

Tool results can carry UI under the MCP Apps extension (`io.modelcontextprotocol/ui`, spec 2026-01-26). The result card for `analyze_roth_conversions` is the first View built this way; the other cards are still native React components in the web app (see "Migration status").

| Responsibility | Owner | Where |
|---|---|---|
| Writing the View (HTML/JS bundle) | MCP server | `mcp-views/src/` (a thin entry around a shared `ui/` component) → built into `backend/app/mcp/views/*.html` |
| Serving it | MCP server | `ui://roth-conversions/result-card.html`, `text/html;profile=mcp-app`, with `_meta.ui.csp` (fonts only) and `prefersBorder: false` |
| Linking tool → View | MCP server | `_meta.ui.resourceUri` on the tool, `visibility: ["model", "app"]` |
| Data contract | MCP server | `structuredContent` for the View, text `content` for the model and text-only hosts |
| Choosing to call the tool | Model | Intent only. It never sees, selects or writes the View. |
| Fetching the View | Host | `resources/read` (`GET /api/mcp-apps/resource`) |
| Isolation | Host | Sandbox proxy on the API's origin (`/mcp-apps/sandbox`), separate from the page's origin, CSP sent as an HTTP header built from the View's declared domains, inner iframe for the View |
| Brokering | Host | `AppBridge` over postMessage (`McpAppFrame.tsx`): tool input/result in, size changes, link requests, and View `tools/call` proxied to `POST /api/mcp-apps/tools/call` (app-visible tools only) |
| Visibility | Host | Tools without `"model"` never reach the model's tool list; tools without `"app"` can't be called by a View |

The same View renders in Claude, ChatGPT or any MCP Apps host with no changes. "See full results" opens the result's `full_results_url` (`what_if_full_results_url` for a what-if), which the server builds (`app/tools/links.py`): `/calculator?view=results&result=<id>&scenario=<encoded scenario>`. Results aren't stored, so the link carries the scenario; the site sends it to `POST /api/scenario-links/open`, which rebuilds and runs it (same scenario, same `result_id`) and opens the results page with the conversation filled in underneath. In our own host, a link to a result the conversation already has opens in place. The model sees the URL too, so in hosts without UI it can share the link.

**Building Views:** `npm run build:views` (repo root). CI fails if `backend/app/mcp/views/` is out of date with its sources (`mcp-views/src/` and `ui/`). The result card is ~365 KB uncompressed, most of it the SDK's MCP client and zod; hosts cache it.

## One component, two renderers (`ui/`)

Cards that appear both in MCP App Views and natively in the web app are defined once, in `ui/`:

- `ui/src/`: display-only React components (`ResultCard`, `ConversionStrip`, `BracketChart` (the tax bracket chart, also used by the results page), `BracketFillChart`, `BalanceComparison`, `ScenarioCompareCard`, `ScenarioSummary`, `MetricCard`), plus chart colors, form options and formatters the web app re-exports. Plain data and callbacks in; no app context, data fetching, analytics or Next imports.
- `ui/tailwind/preset.js` and `ui/styles/tokens.css`: the Paper & Pine theme, CSS variables and component classes (`card-recommended`, `eyebrow`, `metric-*`, `btn-*`). The web app's `tailwind.config.ts` and `globals.css` pull them in.

`ui/` is source-only with no `node_modules`; each consumer resolves its `react` import:

| Consumer | How it renders `ui/` |
|---|---|
| Web app (`frontend/`) | Imports `@lucerna/ui` (path alias in `tsconfig.json`, `next.config.js`, `vitest.config.ts`) and renders it with React. `common/MetricCard` wraps the shared one with the app's tooltip. |
| MCP App Views (`mcp-views/`) | esbuild aliases React to `preact/compat` (~15 KB) and Tailwind compiles the same preset and tokens into the View's inline CSS. |

**Data contract.** Views render the tool's `structuredContent` and View `_meta`; native cards render the same shapes, built from full engine results by `frontend/src/lib/results/viewData.ts`. `shared/fixtures/view-data.json` holds one real call of each tool with a View (regenerate with `python -m scripts.generate_view_fixtures` from `backend/`). Backend and frontend tests check both sides against it.

**Drift check.** `e2e/tests/ui-drift.spec.ts` runs a conversation to a result and a what-if, renders both cards (the result card with its bracket chart) as Views inside the sandbox iframes and natively (the host's fallback, shown while a View loads or if it fails), then compares computed styles and sizes of each part. Any visual difference fails CI. `e2e/tests/scenario-view.spec.ts` mounts the `record_scenario` View, which the web app doesn't show on its own.

**Deploying.** The frontend imports files outside its directory, so the Vercel project must keep "Include files outside the root directory in the Build Step" enabled (the default).

**Views and where they render:**

| Tool | View | Shared component (ui/) | Web app |
|---|---|---|---|
| `record_scenario` | `scenario-summary.html` | `ScenarioSummary` | Not mounted: the host shows its own editable card (same component, wired to the live draft and form) via `show` |
| `analyze_roth_conversions` | `result-card.html` | `ResultCard` with `BracketFillChart`: the results page's `BracketChart` at the optimal schedule | Mounted |
| `compare_roth_scenarios` | `scenario-compare.html` | `ScenarioCompareCard` | Mounted |

Chart series the model doesn't need (yearly income, required withdrawals, conversions and added tax, plus the brackets and standard deduction) travel in the tool result's `_meta["lucerna/view"]` (`backend/app/tools/views.py`), which hosts pass to Views but not to the model. Buttons that act for the user ("Run the numbers", "Apply to my scenario") send a chat message with `ui/message` (`ui/src/messages.ts`); the prompts and MCP server instructions tell the model how to handle them, so every host behaves the same. The `show` tool still renders the bracket and balance charts natively when the model wants one on its own, with the same components. `get_tax_brackets` and `explain_methodology` return reference text and have no View; suggestion chips are web-only.

## Configuration (backend)

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Required for the live assistant. Without it the page falls back to the form and `/demo` uses its scripted version. |
| `LUCERNA_ANTHROPIC_API_KEY` | none | Fallback for `ANTHROPIC_API_KEY`, for environments that reserve that name (Claude Code cloud sessions). |
| `AGENT_MODEL` | `claude-sonnet-5-5` | Model for the agent loop and demo generation. |
| `AGENT_EFFORT` | `medium` | `output_config.effort` for each model call. |
| `AGENT_MESSAGES_PER_CONVERSATION` | `20` | User messages per conversation. |
| `AGENT_MESSAGES_PER_IP_PER_DAY` | `60` | Agent messages per client IP per day. |
| `AGENT_DAILY_SPEND_USD` | `50` | Estimated model spend per day before the assistant pauses. |
| `AGENT_CACHE_DIR` | `backend/.cache` | Where the generated demo conversation is cached. |
| `MCP_ANALYSES_PER_IP_PER_DAY` | `25` | Fresh analyses (optimizer runs that aren't cached) per anonymous caller per day, keyed by client IP. Other tool calls and cached results are free. |
| `MCP_ANALYSES_PER_USER_PER_DAY` | `100` | The same, for signed-in callers (once MCP sign-in lands). |
| `MCP_ANONYMOUS_ANALYSES_PER_DAY` | `3000` | Fresh analyses per day across all anonymous callers. Signed-in callers don't count toward it. |
| `MCP_MAX_CONCURRENT_ANALYSES` | `2` | Optimizer runs in progress at once from MCP tools. |
| `MCP_ANALYSIS_QUEUE_SECONDS` | `10` | How long a run waits for a free slot before the tool answers "busy". |
| `MCP_AUTH_ISSUER` | unset | Clerk Frontend API URL that issues MCP sign-in tokens (production: `https://clerk.rothconversionsoptimizer.com`). Unset turns MCP sign-in off: the account tools say saving isn't available and nothing else changes. |
| `MCP_AUTH_SCOPES` | `profile email` | Scopes clients request at sign-in. |
| `AGENT_MCP_URL` | unset | When set (e.g. `http://localhost:8000/mcp`), the web assistant reaches its tools over streamable HTTP instead of in process. The E2E suite uses it. **Production: leave it unset** (in process, no network hop). If you do set it, also set `MCP_INTERNAL_TOKEN`. |
| `SITE_URL` | `https://rothconversionsoptimizer.com` | Website that `full_results_url` links point to. |
| `MCP_INTERNAL_TOKEN` | unset | Shared secret the web assistant sends (`x-lucerna-internal` header) when it calls `/mcp` over HTTP, so its calls skip the per-caller analysis limits. Its users are already limited at `/api/agent`. Without it, `AGENT_MCP_URL` logs a warning and the backend's own calls use up its IP's daily allowance. |
| `AGENT_OFFLINE` | unset | `1` replaces the model with a rule-based stand-in (development and E2E only). |

Limits are kept in process memory, which fits the single Railway instance. Move them to Redis or Postgres before scaling out.

## Local development

```bash
# Backend with the offline stand-in (no API key needed)
cd backend && AGENT_OFFLINE=1 uvicorn app.main:app --reload --port 8000

# Or with the real model
cd backend && ANTHROPIC_API_KEY=... uvicorn app.main:app --reload --port 8000

cd frontend && npm run dev
```

E2E (uses the offline stand-in automatically): `cd e2e && npx playwright test`. Specs import `test` and `expect` from `e2e/fixtures/test.ts`, which fails any test whose pages (iframes included) throw an uncaught error; `e2e/tests/page-errors.spec.ts` enforces the import.

## Agent stream protocol

`POST /api/agent` with `{message, messages, draft}` returns server-sent events:

| Event | Payload | UI |
|---|---|---|
| `text_delta` | `text` | Streams into the current reply |
| `tool_start` | `name`, `status` | Status line ("Running the optimizer") |
| `draft` | `draft`, `missing` | Updates the shared scenario (form and summary card) |
| `result` | `result_id`, `label`, `result`, `draft?` | Stores a full engine result for cards and the full results view |
| `part` | `part` | Renders a card: `scenario_summary`, `result_headline`, `balance_comparison`, `scenario_compare`, `suggestions` |
| `error` | `code`, `message` | Notice; `unavailable` and limit codes switch to the form |
| `done` | `messages` | API-format turns to append to the stored history |

The browser stores `messages` exactly as returned and sends them back. Never edit earlier turns: thinking blocks and prompt caching depend on an unchanged prefix.

## Evals

```bash
cd backend
python -m evals.run_agent_evals              # live model (spends API credit)
python -m evals.run_agent_evals --offline    # harness smoke test
python -m evals.run_agent_evals --case should-i-do-this --repeat 5
```

Reports land in `backend/evals/results/` (git-ignored). Run the live set after any prompt or tool change; the demo conversation regenerates automatically when either changes.

## Connecting the MCP server

The server speaks MCP over streamable HTTP at `https://<backend-host>/mcp`. No sign-in is needed to connect or to run any analysis.

**Sign-in** (`app/mcp/auth.py`) is lazy and only for the account tools: `save_scenario`, `list_saved_scenarios` and `open_saved_scenario`, which share the website's saved scenarios ("My scenarios"). Clerk's production instance is the OAuth authorization server.

- A `tools/call` for an account tool without a valid token gets HTTP 401 with `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp", scope="..."`, sent before the MCP SDK runs (a tool error inside a 200 never starts sign-in). Claude shows a Connect card and retries the call after sign-in. Every other request passes through.
- `/.well-known/oauth-protected-resource[/mcp]` names the Clerk issuer; `/.well-known/oauth-authorization-server` proxies Clerk's metadata for clients written to older drafts.
- Tokens are Clerk OAuth access tokens (JWT), checked offline for signature, issuer and expiry; `sub` is the Clerk user id, the same as on the website. A valid token on any call makes the caller `user:<id>` for the analysis limits.
- Each tool declares ChatGPT `securitySchemes` in `_meta` (`noauth`, or `oauth2` for account tools), and an account tool called without sign-in in process returns `_meta["mcp/www_authenticate"]`.
- Clerk dashboard (OAuth applications, Settings): publish CIMD and DCR support, and use JWT access tokens. The web assistant's toolbox hides the account tools (the website has its own save).

**Limits** (`app/mcp/limits.py`): only fresh optimizer runs count, so building a scenario, brackets, methodology and re-running a cached result are free. Limits are per caller per day (UTC), with an anonymous ceiling across everyone and a cap on runs in progress. Claude's requests arrive from a pool of Anthropic addresses, so for Claude users the per-IP allowance is shared; the ceiling and the concurrency cap do most of the protecting there. A refused analysis returns a tool error with `limit_reached` (`daily_limit`, `capacity` or `busy`), `resets_at`, and a `full_results_url` so the user can run the scenario on the website instead. View buttons in the web app (`/api/mcp-apps/tools/call`) count against the browser's IP the same way.

- **Claude:** add a custom connector and enter the `/mcp` URL. In a conversation, enable the connector and ask a Roth conversion question.
- **ChatGPT:** with developer mode enabled, create a connector pointing at the same URL.
- **Any MCP client:** configure a remote (streamable HTTP) server with the URL. Inspect it with `npx @modelcontextprotocol/inspector`.

Tools are read-only and stateless: each call carries the full scenario, and each result returns the normalized `scenario` for the next call. A typical flow is `record_scenario` until nothing is missing, confirm with the user, then `analyze_roth_conversions`, then `compare_roth_scenarios` for what-ifs. Missing required inputs come back as a tool error with a `missing_required` list so the client's model asks the user instead of guessing.

Next steps: a privacy page on the website, then submission to the Claude connector directory and the ChatGPT app directory.
