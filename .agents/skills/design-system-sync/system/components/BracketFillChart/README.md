The bracket chart from tool data, with its legend and added-tax row, framed as a card with a title or embedded bare.

**You provide:** `data` (`BracketFillData`: years with income, rmd, withdrawal, taxable_social_security, conversion, extra_deduction, tax; brackets; standard deduction), `framed` (default true; set false inside another card) and optional `stableMaxGrossAmount` (fix the vertical scale while a slider changes the data).

- Each year's `tax` is the engine's tax on that year's conversion, federal and state, so the Tax row adds up to the result's Tax cost.

- The server builds each year from what the engine taxes (backend `app/tools/views.py`), so a bar ends at the engine's taxable income plus the standard deduction. `withdrawal`, `taxable_social_security` and `extra_deduction` are absent from older results, which draw without them.
- `bracketChartYears(data)` turns the data into `BracketChart`'s `years`.

- Check payloads with `isBracketFillData`, which rejects data from older or newer servers so callers can fall back.
