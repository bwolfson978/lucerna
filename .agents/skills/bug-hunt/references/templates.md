# Notes and report formats

## Session note

One file per session, written before the next session starts. Short: it is evidence
for the list, not a transcript.

```markdown
# Session 7: Pension couple in Arizona, claim-age what-if
Chat: <link> (2026-11-23), Claude, <model>. Level: live chat.
Checkout: master <short sha>.

Prompt: "<the first message as sent>"
Follow-up: "What if we claim at 67 where we had 70?"

What happened:
- Turn 1: prepare_scenario, then asked to check the scenario. Defaults named: 3% raises, age 90.
- Turn 2 (confirmed): analyze_roth_conversions.
- Turn 3 (what-if): compare_roth_scenarios with start ages changed, amounts unchanged.

Result: converts $1.22M over 13 years, about $276K estimated lifetime tax savings.

Chat's review:
- <each point it raised, one line, with its numbers>

My review:
- <what you saw in the code or an engine run; file and line where you have one>

New: <issue ids added by this session>, or "nothing new (clean)".
Repeats: <ids of known issues seen again>.
```

## Running issues list

One file for the whole hunt, updated after every session.

```markdown
# Issues so far (7 sessions, 2 clean in a row)
Covered: retired couple FL, sabbatical MA, ACA cliff TX to OR, ...

A. Before the run
A1. **<short name>.** <what happened, one or two sentences, with numbers>. (S1, S4)

B. Inputs
C. Numbers
D. Explanation and cards

Feature gaps (not bugs): ...
```

Group by where in the experience it happens while hunting; the tiers come at the end,
when everything can be ranked together.

## Bug list

A document for the person, not a file in the repo.

- **Opening paragraph**: how many sessions, how many distinct bugs, how many change the
  numbers a user would act on, and the biggest one in a sentence.
- **How to read it**: what Code, Likely, Inferred and Unknown mean.
- **One table per tier**, numbered straight through:

| # | Bug | What the user hit | Root cause | Seen in |
| --- | --- | --- | --- | --- |
| 13 | Social Security what-ifs keep the old benefit | "What if we claim at 67 instead of 70?" kept the age-70 benefit amounts and showed +$53K. With the benefits cut by hand the gap was about $8K. | **Code.** An income source is a fixed dollar amount plus a start age (`models.py` L44-45). Moving the age does not recompute the benefit. | S7 |

  - Tier 1: wrong or misleading numbers
  - Tier 2: friction in the chat
  - Tier 3: confusing output
- **Not bugs**: feature gaps that came up, one line each, and anything not tested.
- **Sources**: a table of sessions (link, household in a few words, findings or
  "clean"), the level each ran at, the date range, the model, and the master commit.

## Re-check report

One line per bug, in the original list's order and numbers:

| # | Bug | Today | Evidence |
| --- | --- | --- | --- |
| 11 | Early-retirement plans ignore the age 59½ rules | **Fixed** (PR #206) | Engine run, retire at 50 with $1.5M: Roth money is spent first and $28,267 of penalties are reported |
| 13 | Social Security what-ifs keep the old benefit | **Reproduces** | Engine run, claim at 67: +$28,356 with the same benefit, -$7,523 with it cut by hand |
| 10 | Claude doesn't reach for the connector on a plain question | **Unknown** | Needs a live chat; no browser was reachable |

End with the commit checked, the date, and which bugs could only be checked at a
weaker level than the one that found them.
