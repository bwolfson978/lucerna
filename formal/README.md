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
| McpLimits `EveryFreshRunIsCharged`, `FreshRunsHoldASlot` | broke on the earlier code (a cached scenario evicted between `is_cached` and the run was computed free and skipped the concurrency cap); hold now that `_run_drafts` takes cached results up front with `cached_result`, so anything it computes was charged and holds a slot | `backend/tests/mcp/test_limits_model.py` |
| McpLimits `RefundsStayOnTheirDay` | broke on the earlier code (a timeout refund after midnight credited the new day); holds now that `charge` returns its day and `refund` gives back only a charge from the current day | same |
| McpLimits `NoChargeWithoutARun` | broke on the earlier code (a client cancelled while queued kept its charge); holds now that `admit` refunds on cancellation too | same |
| AgentSpend `MessagesPerIp` | holds | |
| AgentSpend `MessagesPerClient` | holds. The first model let a client choose its X-Forwarded-For value; a live probe (2026-10-25) showed Railway's edge drops client-sent X-Forwarded-For and X-Real-IP and writes `<client>, <edge hop>`, so the first entry `client_ip` uses is the real address. Model and test corrected, code unchanged apart from documenting this | `backend/tests/mcp/test_limits_model.py` |
| AgentSpend `SpendWithinCap`, `SpendWithinOneMessage` | broke on the earlier code (turns in flight together overshot the daily cap by all their costs); hold now that each admitted message reserves a worst-case turn cost and is admitted only if spend plus reservations fits under the cap | `backend/tests/agent/test_limits_model.py` |
| AutoSave `NoSilentLossWhenSavesSucceed` | broke on the earlier code (a run whose result was slimmed out of session storage was dropped at sign-in, unsaved); holds now that a slimmed result is recomputed from its input and then saved | `ScenarioWorkspace.autosave-model.test.tsx` |
| AutoSave `NoSilentLossWhenStorageFits` | broke on the earlier code (a failed save while signed in hid the banner); holds now that a failed save shows "Couldn't save this analysis" with Try again | same |
| AutoSave `NoSilentLoss` | holds now that both of the above are fixed | same |
| AutoSave `NoDuplicateSaves` | broke on the earlier code (every signed-in run saved a new row); holds now that a scenario keeps one saved row and saves run one at a time | `ScenarioWorkspace.identity.test.tsx` |
| UndoDelete `HiddenWhilePending`, `DeletedStayGone` | hold | |
| UndoDelete `ServerMatchesIntent` | broke on the earlier code (leaving the page while Clerk refreshed the token dropped the pending delete); holds now that the page keeps the token from the list load fresh, so the leave-the-page flush never waits | `page.undo-model.test.tsx` |
| Lean `loop_eq_vec`, `fed_mono_*`, `fed_slope_le_top_*`, `fed_slope_ge_marginal_*` | proved | `backend/tests/engine/test_formal_models.py` checks the premises against the data |
| Lean `code_eq_worksheet`, `taxable_bounds`, `taxable_mono`, `taxable_slope` | proved | same file cross-checks Python against the worksheet |
| Lean `old_engine_misses_spec_from_2027`, `old_wrong_exactly_when` | broke on the earlier code (from 2027 a 67-year-old born 1960 got RMDs at 73, not 75); `engine_meets_spec` proves it holds now that callers pass the plan's first year (PR #198) | `test_rmds_start_by_birth_year_for_a_plan_starting_in_2027` |

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
