# Conversational Agent and MCP Server

How the assistant on `/calculator` and `/demo` works, how to run it, and how to connect the remote MCP server to Claude, ChatGPT or other MCP clients.

## Architecture

```
frontend (Next.js)                        backend (FastAPI)
  ScenarioWorkspace                         POST /api/agent  ─┐
    conversation ⇄ form (shared draft)      GET  /api/agent/demo
    full results view (?view=results)                         │
                                            app/agent  loop, prompt, limits, demo
                                                 │
                                            app/tools  update_scenario, optimize_scenario,
                                                 │     compare_scenarios, get_tax_brackets,
                                                 │     explain_methodology, show
                                                 │
  Claude / ChatGPT / any MCP client ──────▶ /mcp      analyze_roth_conversions,
                                                      compare_roth_scenarios, get_tax_brackets,
                                                      explain_methodology (+ methodology:// resources)
                                                 │
                                            app/engine  optimizer, trace (unchanged)
```

- The engine does all the math. Tools return engine output; the model explains it. Cards and charts in the conversation render engine results directly, never numbers the model wrote.
- Tools live once in `backend/app/tools/`. The web agent and the MCP server are thin adapters.
- The scenario draft (`app/tools/draft.py`, `frontend/src/lib/scenario/draft.ts`) mirrors the form. Parity cases: `shared/fixtures/scenario-draft-cases.json`.

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

Tools are read-only and stateless: each call carries the full scenario. Missing required inputs come back as a `missing_required` list so the client's model asks the user instead of guessing.

Next steps: OAuth once Clerk auth lands (PR #126), per-user limits, and submission to the Claude connector directory and the ChatGPT app directory.
