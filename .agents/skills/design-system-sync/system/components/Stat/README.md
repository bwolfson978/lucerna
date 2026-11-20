A small labeled number inside a card: a sentence-case label, a tabular value and an optional note.

Use it for secondary figures beside a hero metric (Converted, Tax cost, Years in ResultCard). For a standalone figure with its own card, use MetricCard.

**You provide:** `label`, `value` (already formatted, e.g. with `formatCompactCurrency`), optional `tone` (`default` ink, `positive` pine-mid, `negative` destructive) and `note`.

- Value is `.font-data` (Inter, tabular) at 17px/600; label is `.metric-label`.
- Use `negative` only for costs and losses: it is the ember family.
- Put several in a grid inside a `.card`; the component has no surface of its own.
