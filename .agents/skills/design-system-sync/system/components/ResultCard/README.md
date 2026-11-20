Headline result of an analysis: lifetime savings, three stats, a slider for trying other totals and a chart, with an optional link to the full results.

Rendered by the web app's chat and, unchanged, inside the `ui://roth-conversions/result-card.html` MCP App View in Claude and ChatGPT.

**You provide:** `data` (the `analyze_roth_conversions` structured content), optional `details` from the View's `_meta` (`bracket_fill` series for the chart, without which the card falls back to ConversionStrip; `curve` for the slider, absent from older results), optional `onOpenFullResults` (omit to hide the button), `onAsk(message)` (shows "Ask about $180K" once the slider leaves the most savings) and `onSelectionChange` (the slider's total and savings as it moves).

- Surface is `.card-recommended` with the tighter conversation shadow (`shadow-conversation`), since iframes clip wider shadows.
- The hero number is `.metric-value-hero` in `pine`; the eyebrow is mono uppercase. With a curve, MostSavingsNote sits under it.
- Moving the ConversionSlider changes the hero, the stats, the chart's bars and its Tax row together. All of them come from `useResultSlider`, the same calculation the full results page uses, so the two never disagree. The chart's scale stays fixed while the slider moves.
- Tax cost is the engine's total (federal and state), and the chart's Tax row is each year's share of it.
- Validate untrusted payloads with `isResultCardData` / `isResultDetails` before rendering.
