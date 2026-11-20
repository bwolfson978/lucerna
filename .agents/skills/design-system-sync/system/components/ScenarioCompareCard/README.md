A what-if next to the current scenario: the savings difference, a paid-vs-avoided chart and actions to open or apply it.

Output of `compare_roth_scenarios`, in the web chat and as an MCP App View.

**You provide:** `data` (`ScenarioCompareData`), optional `onOpenFullResults` and `onApply` (omit either to hide its button), `applied`, `applyDisabled`.

- The difference reads in `destructive` when the what-if saves less, `pine-mid` when it saves as much or more.
- Without `tax_breakdown` (older results) it drops the chart and still renders.
- Primary action is `.btn-dark`; the secondary is `.btn-ghost`.
