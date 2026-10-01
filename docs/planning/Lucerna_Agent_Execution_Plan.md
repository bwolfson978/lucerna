# Lucerna: Conversational Agent Execution Plan

**Status:** Implemented (see Implementation Notes at the end)
**Last updated:** October 1, 2026
**Supersedes:** M1 plan WS4 (AI Conversation Layer). WS4 tasks 4.1 to 4.7 are folded into the workstreams below.

The conversation is the primary way people use the product. A user arrives at the scenario screen, talks through their situation, and gets results, explanations and charts in the conversation. The form stays available as an equal alternative, and the full results view stays available on request.

Underneath, this is an agent harness: one agent loop with a system prompt and a set of tools. The same tools are also exposed through a hosted MCP server, so Claude, ChatGPT and any other MCP-capable client can answer Roth conversion questions with our engine.

---

## Decision Log

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| A1 | Primary experience | Conversation on the scenario screen (`/calculator`), with a toggle to the form | Matches the brief's "conversational onboarding instead of form-heavy UI" |
| A2 | Default mode | Conversation, for everyone | Product bet; no A/B split at launch |
| A3 | Mode labels | Plain English ("Talk it through" / "Fill in a form"), never "Agent" in the UI | Users are not technical; CLAUDE.md plain-English rule |
| A4 | Where results live | Mostly in the conversation: headline result, compact charts, what-if comparisons | Keeps the user in one flow |
| A5 | Full results | "See full results" action opens today's `ResultsView` for the current scenario, with a way back to the conversation | Detail-oriented users keep the full analysis |
| A6 | Shared scenario state | One `ScenarioInput` draft shared by conversation and form; switching modes never loses input | The form doubles as the way to check and fix what the assistant captured |
| A7 | Numbers integrity | The model never invents inputs or computes results. Inputs are captured through a validated tool; every figure shown comes from the engine | Core principle: deterministic engine + AI explanation layer |
| A8 | Confirm before running | The assistant shows an editable scenario summary card and the user confirms before the optimizer runs | Prevents runs on misheard inputs |
| A9 | Charts | Tools return typed display specs that reference engine output; the frontend renders them with existing components. The model chooses what to show, never the data in it | Reuses ApexCharts and bracket components, and keeps numbers trustworthy |
| A10 | Tool layer | Transport-neutral Python functions with Pydantic models; JSON schemas generated from the models, never hand-written | One source of truth for the web agent and MCP; current `tools.py` has already drifted from `ScenarioInput` |
| A11 | MCP server | Mounted in the existing FastAPI service at `/mcp` (streamable HTTP), thin adapter over the tool layer | Same deploy, same engine, no duplication |
| A12 | Conversation state | Stateless backend for M1: the client sends history and scenario draft each turn | No database dependency; revisit with saved scenarios |
| A13 | Fallback | When the rate limit is hit or the model API is unavailable, the page switches to the form with the draft intact | The product never dead-ends |
| A14 | Legal framing | "The analysis shows" / "based on your inputs", never "you should"; scenario analysis, not advice | Legal requirement, unchanged from M1 |
| A15 | Demo (`/demo`) | Opens to a sample conversation: Margaret (the current demo persona) gives all her details in one message, the agent captures them, runs the optimizer and returns results in the chat. The visitor can then ask follow-ups live | Shows the real experience with zero effort from the visitor |
| A16 | Demo opening exchange | Produced by the real agent and engine, cached server-side keyed by prompt version + engine version + demo scenario; replayed with streaming animation. Follow-ups are live | Same output as a live run, but instant, consistent and free under Reddit-scale traffic. Regenerates automatically when the prompt or engine changes |
| A17 | Landing CTAs | Primary: "Talk through your numbers" (to `/calculator`, conversation mode). Secondary: "See an example" (to `/demo`) | Reflects conversation-first |
| A18 | Launch limits | 20 user messages per conversation, 60 per IP per day, plus a global daily spend cap. Hitting any limit triggers the form fallback (A13). Demo follow-ups count toward the same limits; the cached opening exchange does not | Intake alone takes ~4 to 6 messages, so the M1 figure of 10 to 15 would leave too little room for questions. Spend cap protects against traffic spikes |
| A19 | Conversation persistence | sessionStorage for M1: survives reloads and back navigation in the same tab; "Start over" clears it. Nothing stored server-side | Avoids losing a conversation to an accidental reload without adding stored financial data to the privacy policy. Server-side history comes with saved scenarios |

---

## User Experience

### Scenario screen (`/calculator`)

```
YOUR SCENARIO
Run your numbers.

[ Talk it through | Fill in a form ]      <- toggle, conversation selected by default

  Assistant: Let's map out your situation. How old are you, and
             are you filing single or jointly?
  You:       52, married, about $90k a year, $600k in my 401(k)
  Assistant: Got it. When do you expect to stop working?
  ...
  [ Scenario summary card: every captured value, each tappable to edit ]
  [ Run the numbers ]
  [ Result card: estimated lifetime tax savings, conversion schedule,
    compact bracket chart ]  [ See full results ]
  [ Suggested follow-ups: "Why not convert more?" "What if I retire at 60?" ]

  ------------------------------------------------------------------
  [ Message box, pinned to bottom ]
```

- **Mobile:** the conversation is the page. The message box is pinned to the bottom and respects the safe area, the Safari toolbar and the on-screen keyboard (`visualViewport`). The assistant answers "how it works" questions from the methodology content.
- **Desktop:** the conversation sits in a centered reading column (`max-w-content`). The methodology sidebar keeps working as today.
- **Mode memory:** returning visitors get the mode they last used (localStorage, wrapped in try/catch).

### Demo (`/demo`)

- Opens in conversation mode with a short intro about Margaret, 63, a retired nurse with $1.4M in a traditional 401(k).
- Margaret's first message gives everything at once: age, filing status, balances, income now, Social Security from 2030, spending and when she starts drawing on the 401(k). Her second message confirms the summary.
- The agent's reply plays back with streaming animation: it confirms the captured values in a `scenario_summary` card (shown as already confirmed), then a `result_headline`, a `bracket_fill` chart, a short plain-English explanation of why conversions land in years 1 and 2, and suggestion chips.
- The composer is live. Follow-ups ("What if we only spend $70,000 a year?") run the real agent against Margaret's scenario.
- A banner after the first exchange: "Ready to try yours?" linking to `/calculator`.
- `IncomeMilestonesTable` and the current demo layout are retired; "See full results" covers that detail.

### Results in the conversation

Message content is a list of parts, not just text:

| Part | Shows | Source |
|------|-------|--------|
| `text` | Streaming prose | Model |
| `scenario_summary` | Captured inputs, editable inline, with "Run the numbers" | Scenario draft |
| `result_headline` | Lifetime tax savings, total conversion, tax cost, conversion years | `OptimizationResult` |
| `bracket_fill` | Compact version of `BracketChart` | `OptimizationResult` |
| `balance_comparison` | With vs. without conversion at key ages | `OptimizationResult` |
| `scenario_compare` | Before vs. after for a what-if | Two `OptimizationResult`s |
| `suggestions` | Follow-up question chips | Model, from a fixed menu plus free text |

### Pathway to the full results view

- Every `result_headline` and `scenario_compare` part has a **See full results** action.
- It switches the page to the existing `ResultsView` for that result and pushes a history entry (`?view=results`), so the phone's back gesture returns to the conversation.
- The full view has a sticky **Back to conversation** bar.
- `InfoTrigger` tooltips in the full view gain an **Ask about this** link that returns to the conversation with the question pre-filled.
- For a what-if, the action shows the what-if result. An **Apply to my scenario** action makes the what-if the user's current scenario (and updates the form).

---

## Architecture

```
frontend/ (Next.js)
  app/calculator/page.tsx          mode toggle, view switch (conversation | form | results)
  lib/scenario/                    shared ScenarioDraft store (reducer + context)
  components/conversation/         thread, composer, message part renderers
  components/results/              existing ResultsView, plus compact chart variants
        |
        |  POST /api/agent  (SSE stream: text deltas, tool events, display parts)
        v
backend/ (FastAPI)
  app/tools/                       transport-neutral tools (Pydantic in/out)
  app/agent/                       agent loop, prompts, limits, streaming
  app/mcp/                         MCP server adapter at /mcp
  app/engine/                      unchanged: optimizer, trace, tax
```

### Tools (`backend/app/tools/`)

| Tool | Purpose | Web agent | MCP |
|------|---------|-----------|-----|
| `update_scenario` | Record or correct input values; validates against `ScenarioInput` field rules; returns the draft and what is still missing | Yes | Yes |
| `optimize_scenario` | Run the optimizer on a complete scenario; returns result summary plus reasoning trace | Yes | Yes |
| `compare_scenarios` | Run a what-if against a base scenario and return the differences | Yes | Yes |
| `get_tax_brackets` | Federal and state bracket data for a year and filing status (wraps `/api/tax-config`) | Yes | Yes |
| `explain_methodology` | Retrieve curated methodology sections (assumptions, limits, how the optimizer works) | Yes | Yes, also as MCP resources |
| `show` | Ask the UI to render a display part (`scenario_summary`, `bracket_fill`, ...) for a result already computed | Yes | Returns structured data; rich UI on MCP clients is a later step |

Schemas are generated from the Pydantic models. A test fails if any tool schema diverges from the engine types.

### Agent loop (`backend/app/agent/`)

- Anthropic Messages API with tool use, streamed to the client over SSE.
- System prompt assembled from sections: role and legal framing, product knowledge, intake procedure (required fields, defaults, ask one or two things at a time), tool usage rules, display rules.
- Context per turn: conversation history, scenario draft, latest result summary and reasoning trace.
- Limits: max tool calls per turn, max turns per session (M1 WS4.6, 10 to 15 user messages), request timeout. On limit, a graceful message and a switch to the form (A13).
- Model choice is benchmarked during evals: a capable model for explanation turns, and a cheaper one for intake turns if quality holds.
- Retire `POST /api/chat` and `app/ai/` once `/api/agent` ships.

### MCP server (`backend/app/mcp/`)

- Official Python MCP SDK, streamable HTTP, mounted at `/mcp` in the FastAPI app.
- Tools map 1:1 to the tool layer; methodology content exposed as resources; a short server instruction carries the legal framing.
- M1: no login, per-IP rate limit. After Clerk auth (PR #126) lands: OAuth for connectors, per-user limits.
- Distribution after launch: Claude connector directory, ChatGPT app.

---

## Workstreams

### WSA1: Tool layer (~10 hours)
- A1.1: `app/tools/` package, tool registry, generated JSON schemas
- A1.2: `update_scenario` with field-level validation and "still missing" reporting
- A1.3: `optimize_scenario`, `compare_scenarios`, `get_tax_brackets`
- A1.4: `explain_methodology`: methodology content as structured sections shared with the frontend methodology page (single source)
- A1.5: Tests: schema parity with engine types, each tool against a realistic scenario

### WSA2: Agent harness (~19 hours)
- A2.1: Agent loop with tool execution, turn and tool-call caps
- A2.2: `POST /api/agent` SSE endpoint (text deltas, tool events, display parts, errors)
- A2.3: Modular system prompt (sections above)
- A2.4: Rate limiting and graceful limit/fallback responses
- A2.5: Demo opening exchange: generate with the real agent, cache keyed by prompt version + engine version + scenario, serve via `GET /api/agent/demo`
- A2.6: Global daily spend cap and per-IP daily limit (A18)
- A2.7: Tests with a mocked SDK: tool dispatch, limit handling, stream format

### WSA3: Shared scenario state (~8 hours)
- A3.1: `ScenarioDraft` store (reducer + context) with partial values and validation
- A3.2: Refactor `InputForm` to read and write the shared store (today it holds ~15 local `useState` values)
- A3.3: Tests: values entered in either mode survive mode switches

### WSA4: Conversation UI (~30 hours)
- A4.1: Mode toggle on `/calculator`, conversation as default, remembered mode
- A4.2: Thread and composer: streaming, pinned composer, mobile keyboard and safe-area handling
- A4.3: SSE client in `lib/api/`
- A4.4: Message part renderers: `scenario_summary` (editable), `result_headline`, `suggestions`
- A4.5: Compact chart parts: `bracket_fill`, `balance_comparison`, `scenario_compare`
- A4.6: Opening message and starter chips ("I just left my job", "I'm retiring early", "Explain Roth conversions")
- A4.7: `/demo` conversation: replay of the cached opening exchange, live follow-ups, "Ready to try yours?" banner
- A4.8: Landing page CTA copy and links (A17)
- A4.9: sessionStorage persistence and "Start over"
- A4.10: Design pass against `docs/design-aesthetic.md`; cross-device QA

### WSA5: Full results pathway (~6 hours)
- A5.1: View switch to `ResultsView` with history entry and Back to conversation bar
- A5.2: Apply what-if to scenario
- A5.3: "Ask about this" from `InfoTrigger` into the conversation

### WSA6: MCP server (~10 hours)
- A6.1: MCP adapter at `/mcp`, tools and resources from the tool layer
- A6.2: Per-IP rate limiting, CORS and origin handling
- A6.3: Test with MCP Inspector, Claude (custom connector) and ChatGPT developer mode
- A6.4: Listing copy and submission (post-launch)

### WSA7: Evals and prompt testing (~10 hours)
- A7.1: Eval set of 30+ conversations: intake (complete, partial, contradictory input), explanation, what-ifs, out-of-scope, "should I do this?"
- A7.2: Checks: legal framing, no numbers absent from engine output, correct tool choice, required fields collected before running
- A7.3: Model choice and cost per conversation measured

### WSA8: Analytics (~3 hours)
- A8.1: PostHog events: mode shown, mode switched, message sent, scenario confirmed, results shown in chat, full results opened, what-if run, limit reached, fallback to form

**Total:** ~96 hours (~120 with 25% buffer), replacing WS4's 26 hours.

---

## Build Order

```
WSA1 tool layer ──> WSA2 agent harness ──> WSA4 conversation UI ──> WSA5 full results pathway
                │                       └─> WSA7 evals (runs alongside WSA4)
                └─> WSA6 MCP server (independent once WSA1 is done)
WSA3 shared scenario state ──> WSA4
WSA8 analytics alongside WSA4/WSA5
```

WSA1 and WSA3 can start in parallel.

---

## Open Questions

None at the moment. Former open questions are resolved in A15 to A19.

---

## Implementation Notes

Built on branch `claude/agent-execution-plan`.

- **Model:** `AGENT_MODEL` (default `claude-sonnet-5-5`, per the project's Sonnet decision) at `AGENT_EFFORT` (default `medium`), with server-side refusal fallback (`fallbacks: "default"`) and prompt caching. Requires `ANTHROPIC_API_KEY` on the backend.
- **History:** the browser stores the API-format history exactly as returned and sends it back; the backend only appends. The scenario the user edits in the form reaches the model as a `<scenario_state>` block on their next message, so the system prompt never changes mid-conversation.
- **Results:** full `OptimizationResult`s stream to the browser in `result` events; the model only sees a compact summary plus the reasoning trace.
- **Demo:** `GET /api/agent/demo` runs Margaret's two messages through the real loop once per cache key (prompt, tools, engine source, model, script) and caches the result in memory and `AGENT_CACHE_DIR`. Without model access it builds the same exchange from the tools with fixed wording, so the demo always works and its history supports live follow-ups.
- **Limits:** `AGENT_MESSAGES_PER_CONVERSATION` (20), `AGENT_MESSAGES_PER_IP_PER_DAY` (60), `AGENT_DAILY_SPEND_USD` (50), in process memory. MCP: `MCP_REQUESTS_PER_IP_PER_DAY` (300).
- **Offline development:** `AGENT_OFFLINE=1` swaps the model for a rule-based stand-in that drives the real loop and tools. The Playwright suite uses it.
- **Evals:** `backend/evals/` holds 33 scripted conversations and a runner with deterministic checks (framing, em dashes, numbers grounded in tool results, confirm before running, expected tools and cards) that also reports cost per conversation. They have not been run against the live model yet.
- **Not done:** OAuth for MCP (waits on Clerk, PR #126), connector directory listings, and rich MCP UI rendering.

See `docs/agent-and-mcp.md` for setup.
