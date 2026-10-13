#!/usr/bin/env bash
# Vercel "Ignored Build Step" for the lucerna-storybook project.
# Exit 0 skips the deployment, exit 1 builds it. Builds whenever we can't tell.
#
# Storybook only renders components, so it rebuilds when something it shows
# changed: frontend source, its own config, the shared ui/ package and fixtures,
# or frontend dependencies and styling config.
set -u

PATHS=(
  ":/frontend/src"
  ":/frontend/.storybook"
  ":/frontend/package.json"
  ":/frontend/package-lock.json"
  ":/frontend/tailwind.config.ts"
  ":/frontend/postcss.config.js"
  ":/frontend/scripts/storybook-ignore-build.sh"
  ":/ui"
  ":/shared/fixtures"
)

# Compare with the last commit this branch deployed; on a branch's first push,
# compare with where it left master.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=100 origin master 2>/dev/null || true
  git fetch --quiet --deepen=100 2>/dev/null || true
  base="$(git merge-base HEAD FETCH_HEAD 2>/dev/null || true)"
fi

if [ -z "$base" ] || [ "$base" = "$(git rev-parse HEAD)" ]; then
  echo "No earlier commit to compare with: building Storybook."
  exit 1
fi

if git diff --quiet "$base" HEAD -- "${PATHS[@]}"; then
  echo "No Storybook-relevant changes since ${base:0:7}: skipping."
  exit 0
fi

echo "Storybook-relevant changes since ${base:0:7}: building."
exit 1
