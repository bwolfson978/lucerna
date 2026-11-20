The web app's button: a 44px pill in Inter 15px/600 that lifts 2px on hover.

**You provide:** children, `variant` (`default` pine-deep with cream text, `secondary` accent-light tint, `outline`, `ghost`, `destructive`, `link`), `size` (`default`, `sm`, `lg`, `icon`), `loading` (spinner, disabled), and any button attributes.

- One `default` (pine) primary action per view; `destructive` only for irreversible losses (delete account).
- Same visual language as the `.btn-dark` / `.btn-ghost` classes.
- Known issue in the source: with `size="sm"` on the default variant, tailwind-merge drops the cream text colour because it reads `text-body-sm` as a colour, so the label goes dark on dark (visible in the preview).
