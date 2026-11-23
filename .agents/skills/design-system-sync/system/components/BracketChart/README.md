The tax bracket chart: everything taxed in a year stacked against the federal brackets, with the room left in each bracket. Bottom to top: other income, required withdrawal, withdrawals for spending, the taxable part of Social Security, then the Roth conversion.

One component for the results page, the conversation's result card and the MCP App View. Plain data in.

**You provide:** `years` (`{ year, age?, income?, rmdAmount?, withdrawal?, socialSecurity?, conversion?, extraDeduction? }`), `brackets` (taxable-income brackets, lowest first, top `max` null), `standardDeduction`, optional `addedTax` (each year's tax on its conversion, shown as the Tax row under the Convert row), and layout hooks (`scrollRef`, `onBarWidthChange`, `onLayoutChange`, `hideLegend`, `stableMaxGrossAmount`, `fixedHeight`).

- The axis is income counted for tax. The standard deduction is the 0% band at the bottom and each bracket line sits at the deduction plus the bracket's top, the same in every year. A bar ends at that year's taxable income plus the standard deduction (`barTop`), so it reads against the lines exactly as the engine taxes it.
- `socialSecurity` is only the taxed part of the benefit. It sits right under the conversion because it grows as more is converted, and the two rise together.
- `extraDeduction` (the larger deductions at 65 and over) comes off the bottom of the bar instead of moving the lines. The tooltip lists it.
- The legend (`bracketLegend(years)`, also used by the results page) lists the conversion and whichever other parts some year has.
- Series colours: `chart-income` stone, `chart-rmd` ember, `chart-withdrawal` deep stone, `chart-social-security` mist, `chart-conversion` pine-mid; bracket lines use the `bracket-*` ramp (green low, ember high).
- Scrolls horizontally when years exceed the width. Until the first scroll, a pine-deep pill at the right edge says how many years are hidden ("21 more years"), its arrow nudges right (it holds still under reduced motion), and clicking it scrolls most of a screen. A 56px fade on the right edge marks the cut, and an always-visible track under the bars (`paper-warm` track, `pine-mid` thumb) shows how much is off-screen; drag the thumb or click the track. The native scrollbar is hidden in favour of it, since macOS and many iframes hide native bars until use.
- Set `fixedHeight` inside cards and iframes. Pass `stableMaxGrossAmount` when a slider drives it, so the scale does not jump.
