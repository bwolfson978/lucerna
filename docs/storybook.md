# Storybook

Storybook is Lucerna's component catalog: every shared card and UI primitive, rendered
on its own in Paper & Pine styling, in each state it can be in. It is the living
version of `docs/design-aesthetic.md`: the spec says how things should look, Storybook
shows how the real components do look.

## What it's for

- **Reviewing UI changes on a PR.** Each PR gets a Storybook preview link in a comment.
  Open it to see the changed components without running the app or clicking through to
  the state that shows them (for example, a result card for an older server's output).
- **Building components in isolation.** `npm run storybook` in `frontend/` starts it at
  http://localhost:6006 with hot reload.
- **Knowing what exists.** Before building a new card or control, check whether one is
  already there.

## Layout

| Sidebar section | Source | Stories |
| --- | --- | --- |
| Shared cards | `ui/src/` (also rendered as MCP App Views) | `frontend/src/stories/shared/` |
| UI | `frontend/src/components/ui/` primitives | next to each component |
| Common | `frontend/src/components/common/` | next to each component |

Shared card stories live in `frontend/src/stories/shared/` rather than in `ui/`, since
`ui/` has no dependencies of its own. Their data comes from `shared/fixtures/` (via
`frontend/src/stories/fixtures.ts`), the same real engine output the tests and MCP View
contracts use, so the stories update when the fixtures are regenerated.

## Keeping it current

- When you add or change a component in `ui/src/`, `components/ui/` or
  `components/common/`, add or update its stories in the same PR. Cover the states that
  matter: empty, loading, disabled, error, and older or partial data.
- `src/stories/stories.test.tsx` renders every story in the frontend unit tests, and the
  `storybook` CI job builds the catalog. A story broken by a prop or data change fails the PR.

## PR preview setup (one time)

The `storybook` job in `.github/workflows/test.yml` always builds the catalog and uploads
it as a workflow artifact. To also publish a preview link on each PR:

1. In Vercel, create a project named `lucerna-storybook` in the same team as the web
   app. Don't connect a Git repository. Set the framework preset to **Other** and leave
   the build command empty (CI uploads the already-built static site).
2. In GitHub, add the repository variable `VERCEL_STORYBOOK_PROJECT_ID` with that
   project's ID (Settings, General, Project ID). The job reuses the existing
   `VERCEL_ORG_ID` variable and `VERCEL_TOKEN` secret.
3. Optional: under the project's Deployment Protection, decide who can open previews.
   With Vercel Authentication on, reviewers need a Vercel account in the team.

Until the variable is set the publish step is skipped. PRs from forks also skip it,
since they get no secrets.
