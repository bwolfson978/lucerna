The total amount to convert, on a track that glows where the savings are.

Shared by the result card (web chat, Claude, ChatGPT) and the full results page. A native range input sits invisibly over the drawn track (`.range-overlay`), so dragging, tapping, arrow keys and screen readers work as on any slider.

**You provide:** `value`, `max`, `optimalValue` (the total with the most savings), `onChange`, optional `min` (default 0), `savings` (points of `{ total, savings }` from the result's curve) and `onDragStart` / `onDragEnd`.

- With `savings`, the track runs from `paper-deep` where converting saves little to `pine` at the most savings. Without, it is a `paper-deep` track filled in `pine-mid` up to the thumb.
- A cream diamond marks the most savings on the track. At that total the diamond sits inside the thumb, in `pine`. The words "Most savings" belong beside the headline (MostSavingsNote), not on the track.
- The thumb is a 28px white circle with a 2px `pine-deep` ring and a soft shadow; its touch target is 44px. Focus shows a `pine-mid` ring around the whole track.
- The value snaps to `optimalValue` within about 1.5% of the range. Steps are $100.
- The ends are labeled with the amounts only, in mono 11px (`$0`, `$900K`).
- The gradient colours are computed in the component from `PALETTE`, so they do not follow token edits made here.
