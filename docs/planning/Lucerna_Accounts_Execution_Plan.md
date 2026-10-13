# Lucerna: Accounts, Saved Scenarios and MCP OAuth Execution Plan

**Status:** In progress
**Last updated:** October 13, 2026
**Supersedes:** PR #126 (Clerk auth + scenario persistence), which is four months behind master, uses the retired Warm Midnight theme, and verifies tokens against Clerk's JWKS endpoint without the secret key that endpoint requires.

People can sign in with Google, save scenarios and come back to them. The same account signs them in when they connect the Roth Conversions Optimizer to Claude (or ChatGPT): Clerk is the OAuth authorization server for `/mcp`, and its sign-in page offers Google.

---

## Decision Log

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| U1 | Identity provider | Clerk (free Hobby plan: 50k monthly retained users) | Next.js-native, Google SSO is a dashboard toggle, and its OAuth server supports dynamic client registration (DCR) and Client ID Metadata Documents (CIMD), which Claude uses. One identity for the web app and MCP |
| U2 | Sign-in methods | Google only at launch | One button, no passwords to support. Email can be turned on later in the dashboard without code changes |
| U3 | Database | Postgres on Railway, next to the backend | Same private network, no new vendor. Neon's free tier is the fallback |
| U4 | What a saved scenario holds | The scenario draft (the form's values) plus a name. Results are recomputed when opened | Results go stale when the engine or tax data changes; inputs don't. Keeps rows small (about 2 KB) |
| U5 | User table | None. Rows carry Clerk's user id | Clerk is the user store. Add a table when there is something of ours to keep per user (plan, preferences) |
| U6 | Migrations | Numbered SQL files in `backend/migrations/`, applied at startup under an advisory lock, tracked in `schema_migrations` | No ORM or Alembic for one table; plain SQL is reviewable |
| U7 | Tool surface | Saving is an MCP capability (`save_scenario`, `list_saved_scenarios`, `open_saved_scenario`) in `app/tools/saved.py`. The web app's "My scenarios" page uses REST routes over the same module | CLAUDE.md: the MCP server is the single tool surface; the list page is display, not a capability |
| U8 | `/mcp` access | Sign-in required for every external client once Clerk is configured. The web assistant keeps its internal path and passes the signed-in user's id | Decided by Barry. Enables per-user limits and saving from Claude |
| U9 | MCP token check | Clerk's Backend API verifies each OAuth access token (opaque or JWT), cached for 60 seconds per token | One call covers both token formats and revocation |
| U10 | Limits | Per user when signed in, per IP otherwise (web only). MCP: per user | IP limits punish shared networks; accounts are the better key |
| U11 | Web sign-in UI | Clerk modal from the header, plus `/sign-in` and `/sign-up` pages styled in Paper & Pine. Clerk's OAuth flow uses these pages | Branded sign-in for MCP connections too |
| U12 | Signed-out web users | Everything works as today. "Save scenario" asks them to sign in, then saves | No gate on the core product |
| U13 | Rollout switch | Auth turns on when `CLERK_SECRET_KEY` and `CLERK_ISSUER_URL` are set (backend) and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (frontend). Without them the app runs as today | Merging is safe before the Clerk account exists; previews and CI need no secrets |

---

## Workstreams

### W1. Backend auth (`app/auth/`)

1. `app/auth/clerk.py`
   - `verify_session_token(token)`: Clerk session JWTs from the web app. Uses `clerk-backend-api`'s verifier: keys from Clerk's JWKS endpoint (with the secret key), or networkless with `CLERK_JWT_KEY`. Checks `azp` against the allowed web origins (`app/origins.py`).
   - `verify_oauth_token(token)`: OAuth access tokens from MCP clients via `POST /v1/oauth_applications/access_tokens/verify`. Rejects revoked or expired tokens. 60-second cache keyed by a hash of the token.
   - `auth_enabled()`, `issuer_url()`.
2. `app/auth/identity.py`: the current user for a request.
   - `optional_user` / `require_user` FastAPI dependencies (Bearer session token).
   - A context variable for the web assistant's in-process MCP session.
   - `user_for_tool(ctx)`: the user an MCP tool call runs as (from the HTTP request when served over `/mcp`, else the context variable).
3. Tests with locally signed RS256 keys and a stubbed Backend API.

### W2. Database (`app/db/`, `backend/migrations/`)

1. `migrations/001_saved_scenarios.sql`: `saved_scenarios (id uuid, user_id text, name text, draft jsonb, created_at, updated_at)`, index on `(user_id, updated_at desc)`.
2. `app/db/pool.py`: asyncpg pool from `DATABASE_URL`, JSONB codec, started in the app lifespan. No `DATABASE_URL` means no pool and saving reports unavailable.
3. `app/db/migrate.py`: applies new migration files in order under `pg_advisory_lock`.
4. `app/db/scenarios.py`: `ScenarioStore` with Postgres and in-memory implementations. Per-user cap of 100 saved scenarios.
5. Tests: in-memory store always; Postgres store and migrations when `TEST_DATABASE_URL` is set (CI adds a Postgres service).

### W3. Saved scenario tools and routes

1. `app/tools/saved.py`: transport-neutral save, list, open, rename, delete over the store, validating drafts with the existing draft rules.
2. MCP tools in `app/mcp/server.py`:
   - `save_scenario(scenario, name)`.
   - `list_saved_scenarios()`.
   - `open_saved_scenario(scenario_id)`, which returns the normalized `scenario` to pass on.
   - Signed-out calls return a `sign_in_required` error.
3. REST in `app/api/saved_scenarios.py`: `GET/POST /api/saved-scenarios`, `GET/PATCH/DELETE /api/saved-scenarios/{id}`, all requiring a session token.
4. Prompt and server instructions: when to offer saving, never save without the user asking.
5. Tests for tools (in process, with and without a user) and routes.

### W4. MCP OAuth (`/mcp`)

1. Guard middleware (replaces the per-IP limiter on `/mcp`):
   - Internal web-assistant calls pass with the shared secret and may carry `x-lucerna-user`.
   - When auth is enabled, any other request needs a valid Clerk OAuth token. Otherwise it gets a 401 with `WWW-Authenticate: Bearer resource_metadata="…"`.
   - Daily request limit per user (per IP when auth is off).
2. Protected Resource Metadata (RFC 9728) at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`: resource, `authorization_servers: [CLERK_ISSUER_URL]`, scopes, bearer method.
3. Authorization server metadata passthrough at `/.well-known/oauth-authorization-server` (and `/.well-known/openid-configuration`) for clients on the 2025-03-26 spec, fetched from Clerk and cached.
4. Tests: 401 shape, metadata documents, token accepted, user reaches the tool, internal bypass, limits.

### W5. Web assistant identity

1. `/api/agent` reads an optional session token. The user id keys the limiter and runs the turn's MCP session as that user (context variable in process, `x-lucerna-user` header over HTTP).
2. Same for `/api/mcp-apps/tools/call`.
3. When a tool returns `sign_in_required`, the browser shows a sign-in prompt in the conversation.

### W6. Frontend

1. Install `@clerk/nextjs`. `src/proxy.ts` (Next 16's middleware) runs `clerkMiddleware()` with no protected routes.
2. `AuthProvider`: wraps the app in `ClerkProvider` (Paper & Pine appearance) only when the publishable key is set. It exposes a small `useAccount()` context (`enabled`, `signedIn`, `getToken`, `openSignIn`) so components and tests never touch Clerk directly.
3. Header: "Sign in" (ghost pill) or the account menu, plus "My scenarios" when signed in. Same on mobile.
4. `/sign-in` and `/sign-up` pages with Clerk components.
5. API client sends `Authorization: Bearer <session token>` when signed in, including on `/api/agent`.
6. "Save scenario" in the workspace (conversation, form and full results) when the draft is complete. Signed out: open sign-in, then save. Name defaults from the scenario ("Single, $210K IRA, retire at 62") and can be edited.
7. `/scenarios`: list (name, last saved, key inputs), open, rename, delete. Mobile-first.
8. Opening a saved scenario: `/calculator?saved=<id>` loads its draft into the workspace (form and conversation share it) with a notice.
9. PostHog `identify` on sign-in, `reset` on sign-out (from PR #126).
10. Tests: account context, save button states, scenarios page, API client headers.

### W7. Docs, CI and cleanup

1. CI: Postgres service for backend tests.
2. `.env.example` files, `docs/agent-and-mcp.md` (OAuth section, env vars), CLAUDE.md structure.
3. Close PR #126 as superseded.
4. Privacy policy copy: we store scenario inputs for signed-in users (needs Barry's wording, see below).

---

## Needs Barry

These are steps only an account owner can do. Each is marked with when it's needed. The code ships with auth off until the keys exist, so none of these blocks merging.

| # | When | Step |
|---|------|------|
| B1 | Before testing sign-in | **Create a Clerk application** (dashboard.clerk.com, free Hobby plan). Turn on Google only under User & Authentication. Copy the publishable key, secret key and Frontend API URL (looks like `https://<name>.clerk.accounts.dev`). |
| B2 | Before production sign-in | **Create a Google OAuth client** (Google Cloud Console, free): OAuth consent screen (app name, support email, logo, privacy policy URL), then a Web client using the redirect URI Clerk shows under the Google connection settings. Paste the client id and secret into Clerk. Clerk's shared dev credentials only work on the development instance. Publishing the consent screen to "In production" avoids the 100-test-user cap; basic scopes (email, profile) need no Google review. |
| B3 | Before production sign-in | **Create the Clerk production instance** and add DNS records Clerk lists for `rothconversionsoptimizer.com` (a `clerk.` subdomain and an `accounts.` subdomain). Production keys replace the dev ones. |
| B4 | Before connecting from Claude | **Enable Clerk's OAuth server for MCP** under Configure → OAuth applications: turn on Dynamic client registration and Client ID Metadata Documents ("Publish CIMD support"). Optionally allowlist `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback`. Check which scopes dynamically registered clients may request (we ask for `profile email`). |
| B5 | Before deploying with auth on | **Add a Postgres database to the Railway project**, and reference its `DATABASE_URL` in the backend service's variables. Migrations run on startup. |
| B6 | Deploy | **Set environment variables.** Railway (backend): `CLERK_SECRET_KEY`, `CLERK_ISSUER_URL` (the Frontend API URL), `MCP_RESOURCE_URL` (`https://<backend-host>/mcp`), `DATABASE_URL`. Vercel (frontend): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`. In Clerk, set the sign-in and sign-up URLs (Paths) to the site's `/sign-in` and `/sign-up` so the OAuth flow uses the branded pages. |
| B7 | After deploy | **End-to-end check from Claude:** Settings → Connectors → Add custom connector with `https://<backend-host>/mcp`, sign in with Google, then ask it to save a scenario and confirm it shows on `/scenarios`. Repeat in ChatGPT developer mode if wanted. I can't do this from the sandbox (it can't reach clerk.com or sign in to Google). |
| B8 | Before launch | **Privacy policy and terms:** say that signed-in users' scenario inputs are stored, where, and how to delete them (the `/scenarios` page deletes; account deletion through Clerk's account menu). |
| B9 | When merging | **Close PR #126** as superseded (I can do it if you say so). |

---

## Out of Scope

- Paid plans and Stripe.
- Saving conversation history server-side (the draft is saved; the conversation stays in the browser tab).
- Sharing saved scenarios with other people.
- Email/password sign-in (a dashboard toggle later).
