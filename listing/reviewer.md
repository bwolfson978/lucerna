# Reviewer instructions

Paste into Claude's "Test and launch" step and ChatGPT's "Review details". The password is not in this file: copy it from the `REVIEWER_PASSWORD` variable on the Railway `lucerna` service when filling in the form.

## Account

- Email: reviewer@rothconversionsoptimizer.com
- Password: (from Railway, `REVIEWER_PASSWORD`)
- Sign-in is email and password only. There is no email code, SMS code, MFA or magic link.
- The account already holds three saved scenarios.

## Text for the form

> No account is needed for the analysis tools. Connect the server and try the example prompts: the scenario, result and what-if cards appear without signing in.
>
> Signing in is only for saving. Ask to save a scenario (for example "Save this scenario as Retire at 62 in Texas"). The first save asks you to sign in. Use reviewer@rothconversionsoptimizer.com with the password provided. Then ask "Show my saved scenarios": the new one appears first, followed by three sample scenarios already in the account ("Married · $1500K IRA · 27 yr", "Single · $450K IRA · 36 yr" and "Married · $900K IRA · 31 yr"). Ask to open one to continue from it.
>
> The same account works on the website: sign in at https://www.rothconversionsoptimizer.com/my-scenarios to see the saved scenarios there.
>
> Suggested path through all 10 tools:
> 1. Describe a household (age, filing status, income, IRA balance, retirement age). This calls prepare_scenario and shows the scenario card.
> 2. Press "Run the numbers" on the card, or say "Looks right. Run the numbers." This calls analyze_roth_conversions.
> 3. Ask "What if I retire at 58?". This calls compare_roth_scenarios.
> 4. Ask "What are the 2026 brackets in Colorado?" and "How does the optimizer pick amounts?". These call get_tax_brackets and explain_methodology.
> 5. Save, list and open a scenario as above: save_scenario, list_saved_scenarios, open_saved_scenario.
> 6. Say "I'd like to send feedback" or "Something looks wrong". The agent shows what will be sent and sends it only after you agree: send_feedback, report_problem.
>
> Results are educational scenario analysis, not financial advice. The server never moves money or connects to financial accounts.
