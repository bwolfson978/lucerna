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
| Writing the View (HTML/JS bundle) | MCP server | `mcp-views/src/` → built into `backend/app/mcp/views/*.html` |
| Serving it | MCP server | `ui://roth-conversions/result-card.html`, `text/html;profile=mcp-app`, with `_meta.ui.csp` (fonts only) and `prefersBorder: false` |
| Linking tool → View | MCP server | `_meta.ui.resourceUri` on the tool, `visibility: ["model", "app"]` |
| Data contract | MCP server | `structuredContent` for the View, text `content` for the model and text-only hosts |
| Choosing to call the tool | Model | Intent only. It never sees, selects or writes the View. |
| Fetching the View | Host | `resources/read` (`GET /api/mcp-apps/resource`) |
| Isolation | Host | Sandbox proxy on the API's origin (`/mcp-apps/sandbox`), separate from the page's origin, CSP sent as an HTTP header built from the View's declared domains, inner iframe for the View |
| Brokering | Host | `AppBridge` over postMessage (`McpAppFrame.tsx`): tool input/result in, size changes, link requests, and View `tools/call` proxied to `POST /api/mcp-apps/tools/call` (app-visible tools only) |
| Visibility | Host | Tools without `"model"` never reach the model's tool list; tools without `"app"` can't be called by a View |

The same View renders in Claude, ChatGPT or any MCP Apps host with no changes. In those hosts, "See full results" opens `rothconversionsoptimizer.com/calculator?view=results&result=…`; in our own host it opens the in-app results page for that result.

**Building Views:** `npm run build:views` (repo root). CI fails if `backend/app/mcp/views/` is out of date with `mcp-views/src/`. The result card is ~340 KB uncompressed, most of it the SDK's MCP client and zod; hosts cache it.

**Migration status:** only the result card is a View so far. The scenario summary, bracket-fill and balance charts, what-if comparison and suggestion chips are still native cards selected by the web-only `show` tool; the full results page is first-party and fed by full results the web host requests through `_meta`. Each can move to a View the same way.

## Configuration (backend)

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Required for the live assistant. Without it the page falls back to the form and `/demo` uses its scripted version. |
| `AGENT_MODEL` | `claude-sonnet-5-5` | Model for the agent loop and demo generation. |
| `AGENT_EFFORT` | `medium` | `output_config.effort` for each model call. |
| `AGENT_MESSAGES_PER_CONVERSATION` | `20` | User messages per conversation. |
| `AGENT_MESSAGES_PER_IP_PER_DAY` | `60` | Agent messages per client IP per day. |
| `AGENT_DAILY_SPEND_USD` | `50` | Estimated model spend per day before the assistant pauses. |
| `AGENT_CACHE_DIR` | `backend/.cache` | Where the generated demo conversation is cached. |
| `MCP_REQUESTS_PER_IP_PER_DAY` | `300` | MCP requests per client IP per day. |
| `AGENT_MCP_URL` | unset | When set (e.g. `http://localhost:8000/mcp`), the web assistant reaches its tools over streamable HTTP instead of in process. The E2E suite uses it. In production, leave it unset or exempt the backend's own address from the MCP rate limit. |
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

E2E (uses the offline stand-in automatically): `cd e2e && npx playwright test`.

## Agent stream protocol

`POST /api/agent` with `{message, messages, draft}` returns server-sent events:

| Event | Payload | UI |
|---|---|---|
| `text_delta` | `text` | Streams into the current reply |
| `tool_start` | `name`, `status` | Status line ("Running the optimizer") |
| `draft` | `draft`, `missing` | Updates the shared scenario (form and summary card) |
| `result` | `result_id`, `label`, `result`, `draft?` | Stores a full engine result for cards and the full results view |
| `part` | `part` | Renders a card: `scenario_summary`, `result_headline`, `bracket_fill`, `balance_comparison`, `scenario_compare`, `suggestions` |
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

The server speaks MCP over streamable HTTP at `https://<backend-host>/mcp`, with no login yet (rate-limited per IP).

- **Claude:** add a custom connector and enter the `/mcp` URL. In a conversation, enable the connector and ask a Roth conversion question.
- **ChatGPT:** with developer mode enabled, create a connector pointing at the same URL.
- **Any MCP client:** configure a remote (streamable HTTP) server with the URL. Inspect it with `npx @modelcontextprotocol/inspector`.

Tools are read-only and stateless: each call carries the full scenario, and each result returns the normalized `scenario` for the next call. A typical flow is `record_scenario` until nothing is missing, confirm with the user, then `analyze_roth_conversions`, then `compare_roth_scenarios` for what-ifs. Missing required inputs come back as a tool error with a `missing_required` list so the client's model asks the user instead of guessing.

Next steps: OAuth once Clerk auth lands (PR #126), per-user limits, and submission to the Claude connector directory and the ChatGPT app directory.
