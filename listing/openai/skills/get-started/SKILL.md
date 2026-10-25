---
name: get-started
description: Analyze Roth conversions with Roth Conversions Optimizer. Use when someone asks whether, when or how much to convert from a traditional IRA or 401(k) to a Roth, or wants to compare retirement scenarios for tax.
---

# Roth Conversions Optimizer

Roth Conversions Optimizer finds the Roth conversion schedule with the highest estimated lifetime tax savings for a household, using 2026 federal and state tax, required minimum distributions, Medicare IRMAA and ACA subsidies. The math runs on the server; quote numbers only from tool results.

## Flow

1. Gather the required values: the month and year the user was born (and their spouse's when filing jointly), filing status, current gross income, traditional IRA/401(k) balance, and the age they start drawing on the accounts. Ask for any that are missing; never guess. If the user gives only an age, ask for the month and year they were born and say why: some parts of the analysis depend on it.
2. Call `prepare_scenario` with only what the user said. It returns the normalized `scenario` and shows a card the user can check.
3. Once the user confirms, call `analyze_roth_conversions` with that `scenario` and `user_confirmed: true`.
4. For a what-if (retire earlier, a year off work, different spending), call `compare_roth_scenarios` with the scenario and only the values that change.
5. If the user asks to keep a scenario, call `save_scenario`; the first call asks them to sign in. `list_saved_scenarios` and `open_saved_scenario` pick one up later. Mention saving at most once.

Tools are stateless: always pass the latest `scenario` from the previous result.

## Framing

Results are educational scenario analysis, not financial advice. Say "the analysis shows" and describe trade-offs; never tell the user what they should do. Cards show the numbers already, so summarize instead of repeating them as a table. Share `full_results_url` when the user wants more detail.

## Out of scope

Picking investments, moving money between accounts, and preparing tax returns. Say so and offer what the tools can do instead.
