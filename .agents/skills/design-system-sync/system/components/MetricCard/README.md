A card holding one headline figure, its label and an optional delta line.

**You provide:** `label`, `value` (formatted string), optional `delta` with `deltaType` (`positive` optimal, `negative` destructive, `neutral` muted-foreground), optional `info` node beside the label (the web app passes a tooltip trigger), and class overrides.

- Surface is `.card`; the value is `.metric-value` (Playfair, lining tabular numerals, 16px on phones, 28px from `sm`).
- Labels are sentence case ("Tax on conversions"); never uppercase them.
- Keep delta copy short and plain ("Paid over 3 years").
