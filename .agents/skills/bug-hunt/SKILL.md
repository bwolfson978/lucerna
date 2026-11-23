---
name: bug-hunt
description: Find bugs the way users meet them, by running made-up households through the Roth Conversions Optimizer connector in a real chat, collecting what goes wrong, and writing a ranked bug list with root causes. Also re-checks the bugs on an earlier list against today's code. Use when asked to hunt for bugs, run test chats or conversational QA on the connector or assistant, review the optimizer's output for problems, or reproduce, validate or re-check bugs from a previous bug list.
---

# Bug hunt

Two jobs, same tools:

- **Hunt** (section 2): invent households, talk to the product as each of them, write
  down everything that goes wrong, and keep going until three sessions in a row turn
  up nothing new. The result is a ranked list of bugs, each with what the user hit and
  why it happens.
- **Re-check** (section 3): take a bug list that already exists and say, bug by bug,
  whether it still happens today.

The skill finds and explains problems. It does not fix them, and the list it writes
says nothing about solutions: fixes are picked one bug at a time afterward (section 5).

## 1. Three ways to look

Use the cheapest one that can show the thing, and say which one a finding came from.

| Level | What it is | Shows | Blind to |
| --- | --- | --- | --- |
| **Live chat** | A real conversation in Claude or ChatGPT with the connector on, in the person's signed-in browser | Everything a user sees: whether the app reaches for the connector, tool order, cards, the reply | Costs the person's chat usage and counts toward the connector's daily analysis limit. Talks to production, not your checkout |
| **Replay** | `scripts/replay_chat.py`: a model gets this checkout's connector instructions and tools and plays the conversation | What a model does with our tool contract, counted over several runs | No host system prompt, no on-demand tool loading, no cards. Needs a model key and costs a few cents a run |
| **Engine run** | `scripts/run_scenario.py`: the scenario straight through the tools and optimizer | Exact numbers, schedules, reasoning text, what-ifs. Free, offline, repeatable | Anything the model or the app does |

```bash
source .agents/skills/setup-lucerna/scripts/env.sh       # once per shell (setup-lucerna first on a fresh clone)

# Engine run: scenario JSON uses the prepare_scenario fields (backend/app/tools/models.py)
python .agents/skills/bug-hunt/scripts/run_scenario.py .agents/skills/bug-hunt/examples/pension-couple.json --years 2026-2035
python .agents/skills/bug-hunt/scripts/run_scenario.py scenario.json --what-if changes.json

# Replay: cases are [{"id", "turns": [...]}]; --out keeps full transcripts
export LUCERNA_ANTHROPIC_API_KEY="$(doppler secrets get ANTHROPIC_API_KEY_EVALS --plain)"
python .agents/skills/bug-hunt/scripts/replay_chat.py .agents/skills/bug-hunt/examples/first-turn-cases.json --repeat 2 --out runs/
```

Take only that one key from Doppler. `doppler run` would load every production secret
into the process, and the replayed tool calls would then be logged to production
analytics as if they were users.

A live chat is the real test and the default for a hunt. If no browser can be reached,
say so, use replay for the conversation side, and label those findings "replayed, not
live" so they get a live confirmation later.

Rules that hold at every level:

- **Made-up people only.** Never copy a real user's numbers from traces, feedback or
  support mail into a scenario or a note.
- **Look, don't touch.** In the browser, use only the chat. Do not send feedback or a
  problem report (stop at the preview), do not save scenarios unless that is what you
  are testing, and change no account or connector settings.
- **Write nothing into the repo.** Notes and the bug list are working documents. Keep
  them in the session's shared project folder if it has one (`bug-hunt/<date>/`),
  otherwise in a scratch folder, and hand the list over as a document.
- **Say what was tested.** Note the master commit of your checkout. A live chat tests
  whatever production is serving, which can lag master after a merge.

## 2. Hunt

### Make the households

Start with three you write yourself. Do not wait for anyone to supply cases. Each is a
first message a real person would type, plus one follow-up question they would
plausibly ask. `references/scenarios.md` has the dimensions to vary, the ways to phrase
the first message, and a starter set. Change at least two dimensions from one session
to the next, and keep a line in your notes saying which combinations you have covered.

### Run a session

One household, one new chat.

1. Start a new chat with the connector on. Note the app and the model.
2. Send the first message as written. Do not help: no hints about tools, no corrections
   unless the household would make them.
3. Watch what happens before any result: did it use the connector at all, which tools
   in what order, did it ask for what was missing or guess, did it show the scenario
   and wait before running.
4. When it asks you to check the scenario, read the card or the listed values against
   what you typed and what was defaulted, then confirm as the user would.
5. Read the result as the household would. Then ask the follow-up (usually a what-if).
6. Ask the chat's own assistant to review it. It sees the raw tool results and catches
   things a reader of the reply cannot:

   > Step back and review that result critically, the way a careful tax planner would.
   > What looks wrong, inconsistent with itself, unexplained or missing? Compare the
   > year-by-year schedule with the explanation. Say which inputs or assumptions you
   > had to guess or work around.

7. Add your own review. You know the code; the chat's assistant does not. For any
   number that looks off, pin it with an engine run of the same scenario.
8. Write the session note (`references/templates.md`) before starting the next one.

### What counts as a finding

- A number or schedule that is wrong, or that a knowledgeable person would not believe.
- An explanation that contradicts the schedule or the card next to it.
- The household could not be described: a required value they do not have, a status or
  income the inputs cannot express, something that took several attempts to enter.
- The assistant guessed or invented a value, did its own arithmetic, or ran the
  analysis before the user could check the scenario.
- An assumption that changed the answer and was never mentioned.
- Friction: an error, a retry, a card that did not appear, a dead end.

Something the product simply does not do (heirs, a planning horizon past the limit) is
a **feature gap**: list it separately, not as a bug.

### Keep one list, and know when to stop

After each session, merge its findings into one running issues list. Same cause, same
entry: add the session to "seen in" instead of adding a line. A session is **clean**
when it adds no new entry; repeats of known issues do not count against it.

Stop after **three clean sessions in a row**. If you reach 20 sessions without that,
stop anyway and say so. If the connector's daily limit is hit, stop for the day.

### Find the cause

For every entry, read the code and mark how sure the cause is:

- **Code**: confirmed in the source, with a file and line.
- **Likely**: the evidence points there, not traced end to end.
- **Inferred**: a best guess.
- **Unknown**: needs something you do not have (server logs, a live chat).

Reproduce engine findings with `run_scenario.py` and keep the scenario file: it is the
check that the eventual fix has to pass.

### Write the list

Format in `references/templates.md`. What matters:

- Rank by customer impact: how many users it touches, and whether it changes numbers
  they would act on. Tier 1 is wrong or misleading numbers, Tier 2 is friction in the
  chat, Tier 3 is confusing output around numbers that may be fine.
- Number the bugs once, straight through the tiers. Later work refers to them by
  number, so never renumber a published list.
- Each bug gets what the user hit, with a concrete case and its numbers, and the root
  cause with its confidence mark. Describe the problem: what was unexpected, painful
  or confusing. No expected behavior, no fixes.
- Plain English for the person reading it. They know their product, not your session.

## 3. Re-check an earlier list

Use the list's own numbers and wording. For each bug:

1. **Pin the reproduction.** From the list and its session notes, write the scenario
   and the one observation that showed the bug, as a question with a yes or no answer
   ("does claiming at 67 keep the age-70 benefit?"). If the notes give no scenario,
   build the smallest one that would show it.
2. **Pick the level.** A number, a schedule or the engine's reasoning text: engine
   run. What the assistant does with the tools: replay, several runs. What only an app
   shows (reaching for the connector, cards): live chat. A one-off failure: the tool
   call analytics for errors and durations since the report.
3. **Run it on current master.** A merged PR that claims the fix is a lead, not a
   result: run the reproduction anyway, and cite the PR beside what you saw.
4. **Give it one status**, with the evidence in the same line:
   - **Fixed**: the reproduction no longer shows it.
   - **Partly fixed**: say exactly what still happens.
   - **Reproduces**: with today's numbers.
   - **Not seen again**: could not be made to happen; say what you checked.
   - **Unknown**: needs a level you could not use; say which.
5. **Mind the gap between master and production.** If master is fixed but a live chat
   still shows the bug, check whether the fix has been deployed before calling it open.

Report one line per bug, in the list's order. Then stop: which bug to take next is the
person's call.

## 4. Costs and limits

- A hunt of 10 to 15 live chats uses real chat allowance on the person's account and
  10 to 30 analyses of the connector's daily limit. Say so before starting a long run.
- Replay costs model tokens on the evals key: a few cents per run on the default model.
  Two runs per case is enough to see a pattern; do not go past five without a reason.
- Engine runs are free. An analysis takes about 4 to 10 seconds.

## 5. After the list

Fixing is a separate step: one bug at a time, what the user hits, root cause, two or
three options with a recommendation, the person picks, and the fix is verified against
that bug's reproduction only. Do not rerun the whole hunt to verify one fix. Run a
fresh hunt when enough has changed that new bugs are likely.
