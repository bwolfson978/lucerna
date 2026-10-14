---
name: pr-evidence
description: Capture before and after screenshots (and an optional short video) of a UI change, publish them to the private pr-assets branch, fill the PR's Before / After sections, and share the same images in the chat where the work was requested. Use for every PR that touches frontend/, ui/ or mcp-views/, or when asked to show what a change looks like.
---

# PR evidence: before and after

A reviewer should be able to judge a UI change from the PR page, and from the chat where
they asked for it, without pulling the branch. This skill runs the **same scripted flows** against the base branch and the PR head,
at desktop and phone width, and puts the side-by-side results in the PR description.

The backend runs the offline agent (see `run-lucerna`), so conversations answer the same
way on both sides: any difference in a pair comes from the PR's code.

## When

- Required: the PR changes anything under `frontend/`, `ui/` or `mcp-views/`, or backend
  code whose output the UI renders (`backend/app/tools/`, `backend/app/agent/`, `backend/app/mcp/`).
- Otherwise write "No UI change" in the PR's Evidence section and skip the rest.
- Run it after the change is finished and its tests pass, before asking for review. Run it
  again if a later push changes what the screens look like.

## Steps

1. **Capture.** From the repo root, on the PR branch:

   ```bash
   .agents/skills/pr-evidence/scripts/before-after.sh            # base = merge-base with origin/master
   .agents/skills/pr-evidence/scripts/before-after.sh --flows conversation --video
   .agents/skills/pr-evidence/scripts/before-after.sh --base <ref> --head <ref>   # two commits
   ```

   It checks the base out in a worktree (git hooks off), boots both stacks on ports
   3101/8101 and 3102/8102, runs the flows, stops everything and prints the run dir
   (`.qa-runs/<timestamp>/`, gitignored). Flows are picked from the changed files; pass
   `--flows` when the pick is wrong. It takes about two minutes. `--video` also records the
   PR head's flows to MP4.

2. **Look at every pair.** Read each `pairs/*.png` and `pairs/summary.json`. Each pair is
   marked CHANGED (changed region boxed in ember), NO VISIBLE CHANGE, CHANGED SIZE, NEW or
   REMOVED. Check that:
   - each change you see is one the PR meant to make; anything else is a finding to fix or
     to call out in the PR, never to leave out;
   - NO VISIBLE CHANGE on a screen the PR targets means the flow missed the change: add or
     adjust a flow (below) rather than publishing an empty comparison;
   - `summary.json` `failures` is empty. A failed flow is reported, not hidden.

   If you recorded video, check it with
   `python3 .agents/skills/pr-evidence/scripts/annotate.py sheet <file>.mp4 sheet.png`
   and read the sheet: you cannot watch video.

3. **Pick.** Publish what a reviewer needs, not everything: the reel (`reel.webp`), the
   CHANGED pairs for the screens the PR targets (usually 2 to 6), the phone pair whenever
   layout changed, and an MP4 only when motion matters (a slider, a chart drawing in, a
   transition). Leave out whole-page shots unless the change is spread over the page.

4. **Publish.**

   ```bash
   .agents/skills/pr-evidence/scripts/publish.sh --pr <number> <files>...
   ```

   This adds one commit to the orphan `pr-assets` branch (never merged, never checked out)
   and prints markdown lines with links pinned to that commit. The repo is private, so the
   images show only to people with access. Files over 10 MB are refused. If the push fails,
   say so in the Evidence section and attach nothing; never upload elsewhere.

5. **Write the PR body.** Fill the template's sections with the printed lines:
   - **Before / After:** the reel first, then one line of plain words per pair saying what
     changed, then its image. Group by screen, desktop before phone.
   - **Evidence:** base and head SHAs, flows run, viewports, anything that failed or was
     not covered (for example "sign-in modal: needs Clerk, not captured").
   Use the printed markdown as is; never retype a URL.

6. **Share them where the request came from.** The person who asked for the change
   reviews from the chat, not only from GitHub. In the message that says the PR is up,
   attach the key images from step 3 (the after shots, plus a before/after pair where
   the difference matters) at desktop and phone width, and the MP4 if you recorded one,
   with one line each saying what it shows. Attach the files themselves through
   whatever file attachment your chat surface offers, not just links to the
   `pr-assets` branch, which only render for people signed in to GitHub. If your
   surface can't attach files, say so and link the PR's Before / After section.
   When a later push changes what the screens look like, share the new shots the
   same way.

## Adding or fixing a flow

Flows live in `e2e/capture/flows.mjs`. Each has a `title`, the `paths` whose changes select
it, and `run(page, shot)`, which drives the app and calls
`shot(name, caption, { element, highlight, fullPage })`. Keep shot names stable (they pair
the two sides) and steps deterministic. Prefer cropping to the element that changed
(`element`), since a 720 px side is too small to read a whole page. Run
`node capture/capture.mjs --list` from `e2e/` to see flows and their paths. A flow that
can only exist after the PR (a new page) shows as NEW; it simply fails on the base side.

## Scripts

| Script | Does |
| --- | --- |
| `scripts/before-after.sh` | Base and head worktrees, both stacks, capture, pairs, reel, MP4 |
| `e2e/capture/capture.mjs` | Runs flows against one running app; writes PNGs and `manifest.json` |
| `scripts/annotate.py` | `pair`, `reel`, `video` (ffmpeg) and `sheet` subcommands; Pillow only |
| `scripts/publish.sh` | Commits files to `pr-assets` and prints markdown |
