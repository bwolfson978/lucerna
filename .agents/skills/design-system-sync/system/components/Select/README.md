A single-choice dropdown built on Radix Select, styled like Input, with a white menu on `shadow-elevated`.

**You provide:** `options` (`{ value, label }[]`), `value`, `onChange` (receives `{ target: { value } }` so it drops into input handlers), `placeholder`, `disabled`, `id`, aria flags.

- An empty value shows the placeholder (Radix reserves "").
- Highlighted items get the `glass-bg-hover` tint and accent text.
