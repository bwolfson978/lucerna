The tax bracket chart: each year's other income, required withdrawal and Roth conversion stacked against the federal brackets, with the room left in each bracket.

One component for the results page, the conversation's result card and the MCP App View. Plain data in.

**You provide:** `years` (`{ year, age?, income?, rmdAmount?, conversion? }`), `brackets` (taxable-income brackets, lowest first, top `max` null), `standardDeduction`, optional `addedTax` (each year's tax on its conversion, shown as the Tax row under the Convert row), and layout hooks (`scrollRef`, `onBarWidthChange`, `onLayoutChange`, `hideLegend`, `stableMaxGrossAmount`, `fixedHeight`).

- Series colours: `chart-income` stone, `chart-rmd` ember, `chart-conversion` pine-mid; bracket lines use the `bracket-*` ramp (green low, ember high).
- Scrolls horizontally when years exceed the width. Until the first scroll, a pine-deep pill at the right edge says how many years are hidden ("21 more years"), its arrow nudges right (it holds still under reduced motion), and clicking it scrolls most of a screen. A 56px fade on the right edge marks the cut, and an always-visible track under the bars (`paper-warm` track, `pine-mid` thumb) shows how much is off-screen; drag the thumb or click the track. The native scrollbar is hidden in favour of it, since macOS and many iframes hide native bars until use.
- Set `fixedHeight` inside cards and iframes. Pass `stableMaxGrossAmount` when a slider drives it, so the scale does not jump.
