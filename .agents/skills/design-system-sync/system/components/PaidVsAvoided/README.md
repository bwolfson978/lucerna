One row per scenario: tax paid on conversions to the left of a shared axis (ember), tax they avoid later to the right (pine-mid). The gap is the savings.

**You provide:** `rows`, each `{ label, breakdown: { paid_now, avoided_later }, savings }`.

- Both sides share one scale so rows compare honestly; returns nothing when every value is zero.
- Used inside ScenarioCompareCard; place it in a card when used alone.
