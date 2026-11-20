The scenario as recorded so far, in a two-column table of labeled values with an assumptions row, an income timeline and a Run footer, or as a one-column side panel.

Output of `prepare_scenario`. Values become editable inline when `onEdit` is given.

**You provide:** `data` (`{ scenario, timeline }`), optional `badge` ("Confirmed"), `onEdit(patch)`, `onOpenForm`, `onRun` (omit to hide the footer), `runDisabled`, `hint`, `missing` (field names still required), `collapsible` (start folded to one line), `variant` (`card`, the default, or `panel`) and `highlight` (fields that just changed).

- Header band is `paper-warm` with a mono eyebrow; rows are hairline-divided.
- `panel` is for a side panel or sheet that has its own heading and Run button: no card frame or header, one column at any width, and a required value still missing reads "Add" in pine instead of "Not set".
- A highlighted row gets a 10% `sage` wash and a small mono "New" tag, for values the assistant just filled in.
- People are asked when they were born, not their age: the Born row shows "June 1966", and a Spouse born row appears when filing jointly. Both are edited in the full form. Income from work is labeled "Earned income this year".
- Changing `state` alone should also move `retirement_state`, as the web app's draft does.
