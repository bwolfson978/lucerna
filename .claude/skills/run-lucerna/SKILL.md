---
name: run-lucerna
description: Start Lucerna locally (FastAPI backend with the offline agent plus the Next.js frontend) and know which page shows what. Use to run, open, screenshot or verify the app, and from /run, /verify, pr-evidence or any browser check.
---

# Run Lucerna

Lucerna is two services: the FastAPI backend in `backend/` (port 8000) and the Next.js
frontend in `frontend/` (port 3000). For local checks the backend runs the **offline
agent** (`AGENT_OFFLINE=1`): a rule-based stand-in for the model that needs no API key and
always answers the same way, so a conversation can be replayed step for step.

## Start and stop

```bash
.claude/skills/run-lucerna/scripts/start.sh                       # this checkout, ports 3000/8000
.claude/skills/run-lucerna/scripts/start.sh --dir <checkout> --web-port 3101 --api-port 8101
.claude/skills/run-lucerna/scripts/stop.sh <logs dir printed by start.sh>
```

`start.sh` waits until `/health` and the home page answer, then prints `web=`, `api=` and
`logs=`. It wires the frontend to the backend (`NEXT_PUBLIC_API_URL`), allows that origin
(`ALLOWED_ORIGINS`), and turns off Clerk and PostHog so no keys are needed. Two checkouts can
run side by side on different ports. Always stop what you started.

If it fails, read `backend.log` and `frontend.log` in the logs dir. Common causes:

- `frontend/node_modules` missing: `cd frontend && npm ci`.
- Backend import errors: `cd backend && pip install -r requirements.txt && pip install -e .`.
- Port in use: another stack is running; pick other ports or stop it.

The first request to each page compiles it (Next dev), so the first load can take 10 to 30
seconds. In cloud sessions Chromium is at `/opt/pw-browsers/chromium`; Playwright scripts
take it from `PW_CHROMIUM_PATH`. Never run `playwright install`.

## What lives where

| Route | What it shows | Notes |
| --- | --- | --- |
| `/` | Landing page: hero, interactive explainers, CTA band | Animations respect `prefers-reduced-motion` |
| `/calculator` | Scenario workspace, **Discuss** mode (conversation) | Toggle is a radio group: "Discuss" / "My numbers" |
| `/calculator` + "My numbers" | The same workspace in form mode | |
| `/demo` | Margaret's cached demo conversation and results | Served from `/api/agent/demo` |
| `/methodology` | Methodology article with section sidebar | Copy from `content/methodology.json` |
| `/my-scenarios` | Saved scenarios | Needs Clerk sign-in; without keys it shows the landing page |
| Storybook | Every shared card and UI primitive in each state | `cd frontend && npm run storybook` (port 6006) |

## Reaching a result card

The result card, what-if card and scenario summary appear only after a conversation. With the
offline agent this script always gets there (the same steps as `e2e/tests/ui-drift.spec.ts`):

1. On `/calculator`, fill the "Message" box with
   `I'm 52, married, income $90,000 a year, $600k in my 401k, I want to retire at 60` and press Send.
2. In the scenario summary (`data-testid=scenario-summary`), press "Run the numbers".
3. The result card renders as an MCP App View inside `data-testid=mcp-app`, two iframes deep
   (sandbox proxy, then the View); the card root is `[data-ui=result-card]`.
4. Send `What if I retire at 58?` for a second `mcp-app` holding the what-if card
   (`[data-ui=scenario-compare]`).

Blocking `**/mcp-apps/sandbox**` makes the host fall back to native renders of the same cards
(`data-testid=mcp-app-fallback`).

## Seeing it

For screenshots or before/after comparisons, use the `pr-evidence` skill and its flows in
`e2e/capture/flows.mjs` rather than writing a one-off script. For a quick look, a Playwright
script run from `e2e/` (so it resolves `@playwright/test`) against the printed `web=` URL is
enough. Read every screenshot you take before describing it.
