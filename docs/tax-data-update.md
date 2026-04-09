# Annual Tax Bracket Data Update

Lucerna's optimization engine uses federal and state income tax brackets stored in a static JSON configuration file (`backend/data/tax_brackets_YYYY.json`). This file must be updated each tax year when new brackets are published.

## Data sources

| Source | What it covers | When published | URL |
|--------|---------------|----------------|-----|
| **Tax Foundation** (primary) | All 50 states + DC brackets, rates, deductions | Jan/Feb each year | [taxfoundation.org/data/all/state/state-income-tax-rates/](https://taxfoundation.org/data/all/state/state-income-tax-rates/) |
| **IRS Revenue Procedure** | Federal brackets and standard deduction | Oct/Nov (for next year) | [irs.gov/newsroom](https://www.irs.gov/newsroom) |
| **State DOR websites** | Per-state verification | Varies | See individual state links |

The Tax Foundation publishes a downloadable `.xlsx` spreadsheet alongside their annual article. This is the most efficient single source for all state bracket data.

## When to update

- **Federal brackets**: Usually announced in October/November for the following tax year (e.g., IRS Rev. Proc. 2025-32 announced 2026 brackets in October 2025).
- **State brackets**: The Tax Foundation typically publishes their comprehensive update in January or February. Some states announce changes mid-year due to new legislation.
- **Mid-year changes**: If a state passes significant tax reform, update the JSON and note the change.

## Update workflow

### Step 1: Scaffold the new year's file

```bash
cd backend
python -m scripts.update_state_tax_data --year 2026 --scaffold-only
```

This copies the current year's data to `data/tax_brackets_2026.json` as a starting point, with the metadata year bumped and a note to review.

### Step 2: Get the Tax Foundation data

Download the Tax Foundation's XLSX spreadsheet from their annual article page. The URL pattern is typically:

```
https://taxfoundation.org/data/all/state/state-income-tax-rates-YYYY/
```

Save the XLSX somewhere accessible. You can also try the automated download:

```bash
python -m scripts.update_state_tax_data --year 2026
```

This will attempt to download the XLSX automatically and show you the spreadsheet structure. The XLSX is also saved locally in `data/` for reference.

### Step 3: Review and update the JSON

Open `data/tax_brackets_2026.json` and cross-reference against the Tax Foundation XLSX. For each state, check:

1. **Bracket thresholds** — these change annually for inflation-indexed states
2. **Tax rates** — check for legislative changes
3. **Standard deductions** — these also adjust annually
4. **Tax type** — watch for states switching from progressive to flat (this has been a trend)
5. **No-tax states** — verify the list is still correct

Common things to watch for:
- States that recently switched to flat tax (e.g., Iowa, Louisiana, Georgia)
- Surtax threshold changes (e.g., Massachusetts millionaire tax inflation adjustment)
- New legislation signed between the Tax Foundation publication and your update
- States with pending legislation that takes effect mid-year

### Step 4: Update federal brackets

Check the IRS Revenue Procedure for the new year's federal brackets and standard deduction. Update the `"federal"` section of the JSON:

- `standard_deduction.single` and `standard_deduction.married_filing_jointly`
- All bracket thresholds in `brackets.single` and `brackets.married_filing_jointly`
- Update `metadata.federal_source` with the new Revenue Procedure number

### Step 5: Validate

```bash
python -m scripts.update_state_tax_data --year 2026 --validate data/tax_brackets_2026.json
```

This compares the new data against the current year and flags:
- States where the top rate changed by more than 1 percentage point
- States that changed tax type (progressive to flat or vice versa)
- States that were added or removed
- A summary of all states and rates

### Step 6: Update the engine import

If the filename changed (e.g., `tax_brackets_2026.json` to `tax_brackets_2027.json`), update the reference in:
- `backend/app/engine/state_tax.py` — the `_DATA_DIR` path and filename in `_load_tax_data()`
- `backend/app/engine/tax.py` — the filename in `_load_federal_data()`

### Step 7: Run the test suite

```bash
cd backend
python -m pytest tests/ -v
```

Key things to verify:
- `tests/engine/test_tax.py` — federal bracket calculations still correct
- `tests/engine/test_state_tax.py` — state calculations still correct (you may need to update expected values if brackets changed)
- `tests/scripts/test_update_state_tax_data.py` — JSON integrity checks pass
- `tests/engine/test_optimizer.py` — full optimization pipeline still works

### Step 8: Update the frontend (if needed)

If a state's top rate label changed significantly, update the `STATE_OPTIONS` array in:
- `frontend/src/components/calculator/InputForm.tsx`

The rate shown in the dropdown label is cosmetic (for user reference), not used in calculations.

## File structure

```
backend/
  data/
    tax_brackets_2026.json    # The active configuration file
  scripts/
    update_state_tax_data.py  # The update automation tool
    __init__.py
  app/engine/
    tax.py                    # Loads federal brackets from JSON
    state_tax.py              # Loads state brackets from JSON
  tests/
    scripts/
      test_update_state_tax_data.py  # Tests for the update tool + JSON integrity
```

## JSON schema

```json
{
  "metadata": {
    "tax_year": 2026,
    "primary_source": "Tax Foundation - ...",
    "primary_source_url": "https://...",
    "federal_source": "IRS Revenue Procedure 2025-32",
    "last_updated": "2026-04-09",
    "notes": "..."
  },
  "federal": {
    "standard_deduction": { "single": 16100, "married_filing_jointly": 32200 },
    "brackets": {
      "single": [
        { "min": 0, "max": 12400, "rate": 0.10 },
        ...
        { "min": 640600, "max": "inf", "rate": 0.37 }
      ],
      "married_filing_jointly": [ ... ]
    }
  },
  "states": {
    "CA": {
      "name": "California",
      "has_income_tax": true,
      "tax_type": "progressive",
      "standard_deduction": { "single": 5540, "married_filing_jointly": 11080 },
      "brackets": {
        "single": [ { "min": 0, "max": 10756, "rate": 0.01 }, ... ],
        "married_filing_jointly": [ ... ]
      },
      "notes": "Optional notes about special rules"
    },
    "TX": {
      "name": "Texas",
      "has_income_tax": false
    }
  }
}
```

Key conventions:
- Bracket `max` values use the string `"inf"` (not `Infinity`) for JSON compatibility
- Rates are decimal (0.05, not 5%)
- Standard deduction of 0 means the state has no standard deduction
- States that use the federal standard deduction should have their deduction set to match the federal value
- `tax_type` is `"flat"`, `"progressive"`, or `"none"` (for no-tax states)

## Troubleshooting

**"Module not found" when running the script**: Run from the `backend/` directory with `python -m scripts.update_state_tax_data`.

**Tax Foundation changed their XLSX format**: The parser may fail. Download the XLSX manually, use `--scaffold-only` to create the base file, then update manually by cross-referencing the spreadsheet.

**A state passed mid-year legislation**: Update the JSON directly, add a note in the state's `notes` field, and bump `metadata.last_updated`.

**Test failures after update**: Expected values in tests (e.g., `test_ca_single_known_bracket`) are based on specific bracket data. If brackets changed, update the test expected values to match.
