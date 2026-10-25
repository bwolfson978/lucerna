# Formal models

Small models of the parts of Lucerna where a bug hides in an interleaving or in
arithmetic that tests sample but don't cover. Each broken property has a
failing test next to the code it is about (`xfail(strict=True)` in pytest,
`it.fails` in Vitest), so a fix shows up as an unexpected pass and the marker
comes off.

| Model | What it covers | Tool |
| --- | --- | --- |
| `tla/McpLimits.tla` | MCP analysis limits: cache check, daily charge, concurrency slots, refunds, midnight (`backend/app/mcp/limits.py`, `_run_drafts` in `server.py`) | TLA+ / TLC |
| `tla/AgentSpend.tla` | Website assistant limits: per-IP messages, daily spend cap (`backend/app/agent/limits.py`, `api/agent.py`) | TLA+ / TLC |
| `tla/AutoSave.tla` | Saving runs to My scenarios, including runs made before sign-in (`ScenarioWorkspace.tsx`, `lib/agent/conversation.ts`) | TLA+ / TLC |
| `tla/UndoDelete.tla` | Delete with undo on My scenarios (`app/my-scenarios/page.tsx`) | TLA+ / TLC |
| `lean/Lucerna/FederalTax.lean` | The two federal tax implementations agree; 2026 tax is monotone, at most 37% and at least the reported marginal rate per extra dollar (`engine/tax.py`) | Lean 4 |
| `lean/Lucerna/SocialSecurity.lean` | Taxable Social Security equals IRS Pub. 915 Worksheet 1; 0 to 85% of benefits; at most 85 cents per extra dollar (`engine/year_tax.py`) | Lean 4 |
| `lean/Lucerna/RmdStartAge.lean` | RMD start age by birth year (`engine/rmd.py`) | Lean 4 |

## Results

`tla/check.sh` checks every invariant on its own and says whether it held or
broke as expected.

| Property | Result | Test |
| --- | --- | --- |
| McpLimits `CallerAllowance`, `AnonymousCeiling` | hold | |
| McpLimits `EveryFreshRunIsCharged` | broken: a cached scenario evicted between `is_cached` and the run is computed free | `backend/tests/mcp/test_limits_model.py` |
| McpLimits `FreshRunsHoldASlot` | broken: the same run skips the concurrency semaphore | same |
| McpLimits `RefundsStayOnTheirDay` | broken: a timeout refund after midnight credits the new day | same |
| McpLimits `NoChargeWithoutARun` | broken: a client cancelled while queued keeps its charge | same |
| AgentSpend `MessagesPerIp` | holds | |
| AgentSpend `MessagesPerClient` | broken if the proxy appends to X-Forwarded-For: `client_ip` trusts the first entry | `backend/tests/mcp/test_limits_model.py` |
| AgentSpend `SpendWithinCap`, `SpendWithinOneMessage` | broken: turns in flight together overshoot the daily cap by all their costs | `backend/tests/agent/test_limits_model.py` |
| AutoSave `NoSilentLossWhenSavesSucceed` | broken: a run whose result was slimmed out of session storage is dropped at sign-in, unsaved | `ScenarioWorkspace.autosave-model.test.tsx` |
| AutoSave `NoSilentLossWhenStorageFits` | broken: a failed save while signed in hides the banner, nothing tells the person | same |
| AutoSave `NoDuplicateSaves` | broke on the earlier code (every signed-in run saved a new row); holds now that a scenario keeps one saved row and saves run one at a time | `ScenarioWorkspace.identity.test.tsx` |
| UndoDelete `HiddenWhilePending`, `DeletedStayGone` | hold | |
| UndoDelete `ServerMatchesIntent` | broken: leaving the page while Clerk refreshes the token drops the pending delete | `page.undo-model.test.tsx` |
| Lean `loop_eq_vec`, `fed_mono_*`, `fed_slope_le_top_*`, `fed_slope_ge_marginal_*` | proved | `backend/tests/engine/test_formal_models.py` checks the premises against the data |
| Lean `code_eq_worksheet`, `taxable_bounds`, `taxable_mono`, `taxable_slope` | proved | same file cross-checks Python against the worksheet |
| Lean `engine_misses_spec_from_2027`, `wrong_exactly_when` | counterexample: from 2027 a 67-year-old (born 1960) gets RMDs at 73, not 75 | `test_rmds_start_by_birth_year_for_a_plan_starting_in_2027` |

## Running

TLA+ needs Java 11+ and `tla2tools.jar`:

```bash
curl -sSL -o ~/tools/tla2tools.jar \
  https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar
formal/tla/check.sh            # or: formal/tla/check.sh McpLimits
```

Lean needs [elan](https://github.com/leanprover/elan); the toolchain is pinned in
`lean/lean-toolchain` and there are no dependencies (no Mathlib):

```bash
cd formal/lean && lake build
```

The models are transcriptions, so they drift if the code changes. The tests in
`backend/tests/engine/test_formal_models.py` fail when the Lean bracket table or
RMD rules stop matching `backend/data/`.
