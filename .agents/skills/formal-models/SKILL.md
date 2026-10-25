---
name: formal-models
description: Keep Lucerna's TLA+ and Lean models (formal/) in step with the code, model new stateful or rules-heavy features before building them, and turn a model finding into a failing test and then a fix. Use when a change touches a file listed in formal/paths.yml, when proposing a feature with state, retries, sign-in, concurrency or tax and age rules, or when a model shows a property broken.
---

# Formal models

`formal/` holds small models of the code where bugs hide in orderings or edge-case
math. TLC checks the TLA+ specs (`formal/tla/`) by trying every ordering in a small
world; Lean proves the tax and age rules (`formal/lean/`) for every input.
`formal/paths.yml` lists the files each model covers, and `formal/README.md` lists
each property and the test that ties it to the real code.

The rule over all of it: **every invariant holds and every test passes.** Nothing
merges with an expected-to-fail invariant, an `xfail` or `it.fails` marker, a skipped
test or a bypassed check. A broken property is either fixed in the code now, or, if
the behavior is actually fine, the invariant or test is rewritten to say exactly what
we accept, and then it holds and is checked.

## Setup and running

```bash
.agents/skills/formal-models/scripts/install.sh          # Java check, tla2tools.jar, elan
.agents/skills/formal-models/scripts/check.sh            # TLC on every spec + lake build --wfail
.agents/skills/formal-models/scripts/affected.sh         # models covering this branch's changes
formal/tla/check.sh AutoSave                             # one spec
```

`install.sh` downloads tla2tools.jar (4.5 MB, SHA-256 checked) and elan; the first
`lake build` then fetches the pinned Lean toolchain, about 3 GB unpacked. Tell the
person before running it on their machine. In a cloud session just run it. A full
check takes about 1.5 minutes. CI's `formal` job runs the same scripts on any PR that
touches `formal/paths.yml` files.

## 1. A change touches modeled code

1. Run `affected.sh`. For each model it names, read the model's actions and the
   code side by side, and decide whether the change alters behavior the model
   describes (an order of steps, a condition, a state, a number in a rule).
2. If it does, update the model in the same PR: actions, constants, invariants and
   the README Results row. If a file moved or a model gained coverage, update
   `formal/paths.yml`.
3. Run `check.sh`. Every line must say `hold` and Lean must build.
4. Fill the PR's **Formal models** section: `updated: <model, what changed>`,
   `not affected: <why>` (a log line, a rename, copy), or `n/a`.

## 2. A new feature with state or rules (model first)

Applies to features with state that changes over time or across requests (saving,
sign-in, retries, limits, queues, undo, two tabs) or with tax or age thresholds
(birth date, 59½, IRMAA tiers, ACA cliffs, deductions). Layout, copy, styling and
pass-through fields skip it; if unsure, say which way you went and why in one line.

1. During the proposal, model the current code and each option. Keep it small: a few
   requests, two or three ids, bounded counters. TLA+ for orderings, Lean for math.
2. Put a "What must always be true" block in the proposal: three to six invariants
   in plain English (see `references/invariants.md`), and for each option which hold
   and which break, with the shortest breaking story in one sentence.
3. After the person picks, the model lands in the same PR as the code, with its
   files added to `formal/paths.yml` and a README row per property.

## 3. A model shows a property broken (red, then green)

1. Read the counterexample (`formal/tla/out/<Spec>-<Invariant>.log`, or the Lean
   error). Turn it into a short story: what the person does, what goes wrong.
2. **Red.** Replay it against the real code as a test (pytest next to the code's
   tests, or Vitest next to the component) and show it failing, in its own commit so
   the PR history shows red before green. If it can't be made to fail, the model is
   wrong: fix the model, not the code, and say so.
3. Bring it to the person in the bug format: what a user would hit, root cause, 2 or
   3 options, a recommendation. One option is always "this behavior is fine", which
   means rewriting the invariant to state the accepted bound.
4. **Green.** The same PR lands the fix (or the rewritten invariant), the test
   passing and the README row. Never merge the red test on its own.

## Rules

- No `sorry`, `admit` or new `axiom` in Lean; `--wfail` fails the build on `sorry`.
- Keep TLC models small enough to finish in seconds; CI stops the job at 10 minutes.
- Transcribed constants (brackets, RMD tables) stay tied to `backend/data/` by
  `backend/tests/engine/test_formal_models.py`; extend it when a model copies data.
