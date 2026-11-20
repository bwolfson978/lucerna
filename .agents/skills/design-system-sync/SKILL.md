---
name: design-system-sync
description: Rebuild the Paper & Pine design system page from master and publish it, so the page always shows the components and tokens that are in the code. Use right after a PR merges that changed ui/, frontend/src/components/ui/, shared/fixtures/view-data.json or this skill's folder, when asked to sync or refresh the design system, or when the page turns out to be behind master.
---

# Design system sync

The Paper & Pine design system page (https://claude.ai/artifact/DmM5iwLcxeTE8rA6siDr1M)
does not read this repository. It holds a built copy of the shared components, their
stylesheet, one preview per component and the token list. This skill rebuilds that copy
from the code and publishes it. The page is read-only ("synced from code"): nothing is
edited on the page, every change goes through this folder and the code.

## When

- **After the merge, from master.** A PR that changed `ui/`, `frontend/src/components/ui/`,
  `shared/fixtures/view-data.json` or this folder ends with a sync once it has merged.
  Never publish from an unmerged branch: the page would show work that is not in master.
- When someone asks for a sync, or you find the page behind. To check: the page's
  `project/tokens.json` has `meta.ref` (`master@<sha>`); the page is behind when this prints
  anything:

  ```bash
  git fetch origin master
  git log --oneline <sha>..origin/master -- ui frontend/src/components/ui \
    shared/fixtures/view-data.json .agents/skills/design-system-sync
  ```

- **In the PR itself** (before merge), when you add, remove or change a shared component or
  a token, update the hand-written files below in the same PR and run steps 1 and 2 on the
  branch to see that they pass. Do not publish yet.

## Steps

Run from the repo root, on a clean checkout of current `origin/master`, with the frontend
and mcp-views packages installed (`setup-lucerna`). If this checkout has other work in
it, use a second one and borrow the installed packages:
`git worktree add --detach ../lucerna-ds origin/master`, then run the two scripts from
there with `--deps <path of this checkout>`.

1. **Build.**

   ```bash
   node .agents/skills/design-system-sync/scripts/build.mjs
   ```

   It writes every file of the page to `.agents/skills/design-system-sync/out/project/`
   (git-ignored) and the list of them to `out/publish.json`. It stops with a list of
   `problems` when a card has no preview or note, a listed component is gone from the
   code, a component exported from `ui/src/index.ts` has no card, or a colour in
   `system/tokens.json` differs from the code. Fix those in a PR first; do not publish
   around them.

2. **Check the previews.**

   ```bash
   source .agents/skills/setup-lucerna/scripts/env.sh
   node .agents/skills/design-system-sync/scripts/check.mjs
   ```

   It opens every preview the way the page does, fails on an error or an empty render,
   and saves screenshots to `out/shots/1000/` and `out/shots/390/`. Look at the ones for
   the components that changed.

3. **Publish.** This needs an agent that can publish claude.ai artifacts (Claude Code
   sessions can). An agent that cannot stops here and says in the PR or chat that a
   design system sync is owed.
   - Read `project/design-system.json` from the page and save it as
     `out/project/design-system.json`. Change only `lastChange`: `by` (the person you
     work for), `at` (now, ISO 8601), `via` (`GitHub · bwolfson978/lucerna@<sha>`, never
     starting with "CI"), `note` (one line on what changed). Keep `"editing": "code"`
     and every other key as it is: the index also lists the logos, which are uploads.
   - Publish once to the page's URL: the page file is `out/project/design-system.json`,
     the root is `out/`, and the supporting files are the map in `out/publish.json`,
     passed as it is (it already marks `index.d.ts` as plain text, which the page needs).
   - A component that was removed: also remove its `project/components/<Name>/README.md`
     and `preview.html` in that publish. Write nothing outside `project/`.

4. **Report** in the chat where the work was requested: the page link, the commit, and
   what changed, with the desktop and phone screenshots of the changed previews.

## What is hand-written here

| Path | What | Change it when |
| --- | --- | --- |
| `previews/<Name>.html` | One preview per card: the variants worth showing | A component is added, or its props or states change |
| `system/components/<Name>/README.md` | When to use it, what the caller supplies | Same |
| `system/components/index.d.ts` | Props as documentation | Props change |
| `system/tokens.json` | Token values with usage notes | A value changes in `ui/tailwind/preset.js` or `ui/styles/tokens.css` |
| `system/README.md` | The brand book | `docs/design-aesthetic.md` changes |
| `COMPONENTS` in `scripts/build.mjs` | Which exports get a card, in page order | A component is added or removed |

Everything else on the page is generated: `bundle.js`, `bundle.css`, `tokens.css` and
the data inside the previews. `{{sha}}` and `{{date}}` in the hand-written files become
the commit and the day of the build.

## Writing a preview

- Line 1 is the card marker: `<!-- @dsCard group="Shared cards" height=230 subtitle="..." -->`.
  `height` is the row height in px; take it from `renderedHeight` at 1000px in the check's
  output, plus about 10.
- The page preloads the tokens, the stylesheet, React 18 and `window.LucernaUI`. The
  preview is a root element and one script that renders `window.LucernaUI.<Name>` with
  `React.createElement`. It fetches nothing. Copy an existing file as the start.
- Real numbers come from `shared/fixtures/view-data.json`: put `/*@fixture resultCard*/`
  in the script and the build replaces it with `var F={resultCard: ...};`. The names are
  `resultCard`, `resultDetails`, `bracketFill`, `slider`, `compare` and `scenario`
  (see `FIXTURES` in `scripts/build.mjs`).
- Previews and notes are user-facing copy: plain English, no em dashes.
