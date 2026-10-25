# Writing invariants for a proposal

An invariant is a sentence that must be true in every state the system can reach.
In a proposal, write it so the person can judge it without reading TLA+ or Lean:

- Say it from the user's side: what they see, keep or pay, not variable names.
- One claim per line, with no "usually" or "should". If it has an exception, the
  exception is part of the sentence.
- Name the bound when the guarantee is approximate.

Good examples from the models we have:

| Plain English | Model |
| --- | --- |
| A run made before sign-in is saved exactly once after sign-in. | AutoSave `NoSilentLoss`, `NoDuplicateSaves` |
| If a save fails while you're signed in, you're told and can try again. | AutoSave `NoSilentLossWhenStorageFits` |
| A scenario you deleted and didn't undo is gone on the server, even if you left the page. | UndoDelete `ServerMatchesIntent` |
| Every analysis we compute was charged to someone's daily allowance. | McpLimits `EveryFreshRunIsCharged` |
| The assistant's spend for the day never passes the cap. | AgentSpend `SpendWithinCap` |
| Tax never goes down when income goes up. | Lean `fed_mono_*` |
| Taxable Social Security matches IRS Pub. 915 Worksheet 1 for every input. | Lean `code_eq_worksheet` |
| Nobody born 1960 or later has an RMD before 75. | Lean `engine_meets_spec` |

Accepting behavior means rewriting the sentence, not marking it broken. For
example, "the spend cap can be overshot by at most one turn's cost" in place of
"spend never passes the cap".
