The line under a savings headline that says where the conversion slider stands.

Used in ResultCard and on the full results page, directly under the hero number.

**You provide:** `atOptimal`, `shortfall` (how much less the amount shown saves), optional `onBack` (omit to hide the button) and `caption` (what the headline means, said after "Most savings").

- At the most savings: a `pine` diamond and "Most savings" in caption 600, then the caption in tertiary-foreground. The diamond is the one that marks the spot on the ConversionSlider's track.
- At another amount: "$4,210 less than the most savings" in `destructive`, and an underlined "Back to most savings" in `pine`.
- One line where there is room; on a phone both states wrap to two. It keeps a 24px minimum height so the card does not jump between states.
