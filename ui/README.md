# @lucerna/ui

Display-only components and the Paper & Pine theme, shared by the web app
(`frontend/`) and the MCP App Views (`mcp-views/`) so both render the same cards.

- `src/`: React components. Plain data and callbacks in; no app context, fetching,
  analytics or framework imports. Mark parts with `data-ui` for the drift check.
- `tailwind/preset.js`: theme tokens for Tailwind.
- `styles/tokens.css`: CSS variables and component classes.

Source-only, nothing to install: consumers alias `@lucerna/ui` to `src/index.ts` and
resolve `react` from their own `node_modules` (React in the web app, preact/compat in
Views). See `docs/agent-and-mcp.md`, "One component, two renderers".
