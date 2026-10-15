#!/usr/bin/env bash
# Publish evidence files to the orphan `pr-assets` branch and print markdown for the PR.
#
# Usage: publish.sh --pr <number> [--repo owner/name] <file>...
#
# Files land at pr-<number>/<timestamp>/<name> in one commit on pr-assets, made with git
# plumbing so the working tree and current branch are untouched. Links are pinned to that
# commit's SHA, so a later publish never changes what an older comment shows. The repo is
# private: the images render for anyone who can see the PR and for no one else.
#
# Prints one markdown line per file: an image for .png/.webp/.gif/.jpg, a link otherwise
# (GitHub only plays video dragged into a comment by hand, so MP4s are download links).
#
# Every commit also carries frontend/vercel.json turning Vercel's git deployments off.
# Both Vercel projects (lucerna, lucerna-storybook) build every branch push from the
# frontend/ root directory, which this branch doesn't have, so without it each publish
# shows up as two failed "Preview" deployments.
set -euo pipefail

PR=""
REPO="bwolfson978/lucerna"
FILES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) PR="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    *) FILES+=("$1"); shift ;;
  esac
done
[[ -n "$PR" && ${#FILES[@]} -gt 0 ]] || { echo "usage: publish.sh --pr <number> <file>..." >&2; exit 2; }

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "no such file: $f" >&2; exit 1; }
  size=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")
  (( size <= 10 * 1024 * 1024 )) || { echo "over 10 MB, not publishing: $f" >&2; exit 1; }
done

BRANCH=pr-assets
PREFIX="pr-$PR/$(date +%Y%m%d-%H%M%S)"
PARENT=""
for attempt in 1 2 3 4; do
  git fetch -q origin "$BRANCH" 2>/dev/null && PARENT="$(git rev-parse FETCH_HEAD)" && break
  # A missing branch is not a network error: the first publish creates it.
  git ls-remote --exit-code origin "refs/heads/$BRANCH" >/dev/null 2>&1 || break
  sleep $((2 ** attempt))
done

INDEX="$(mktemp)"
trap 'rm -f "$INDEX"' EXIT
export GIT_INDEX_FILE="$INDEX"
if [[ -n "$PARENT" ]]; then git read-tree "$PARENT"; else git read-tree --empty; fi
VERCEL_BLOB="$(printf '{\n  "git": { "deploymentEnabled": false }\n}\n' | git hash-object -w --stdin)"
git update-index --add --cacheinfo "100644,$VERCEL_BLOB,frontend/vercel.json"
PATHS=()
for f in "${FILES[@]}"; do
  path="$PREFIX/$(basename "$f")"
  blob="$(git hash-object -w "$f")"
  git update-index --add --cacheinfo "100644,$blob,$path"
  PATHS+=("$path")
done
TREE="$(git write-tree)"
unset GIT_INDEX_FILE
MSG="Evidence for #$PR ($PREFIX)"
if [[ -n "$PARENT" ]]; then
  COMMIT="$(git commit-tree "$TREE" -p "$PARENT" -m "$MSG")"
else
  COMMIT="$(git commit-tree "$TREE" -m "$MSG")"
fi

for attempt in 1 2 3 4 5; do
  if git push -q origin "$COMMIT:refs/heads/$BRANCH" 2>/tmp/pr-assets-push.err; then break; fi
  if grep -qiE "non-fast-forward|fetch first|rejected" /tmp/pr-assets-push.err; then
    echo "pr-assets moved while publishing; run publish.sh again" >&2
    exit 1
  fi
  [[ $attempt == 5 ]] && { cat /tmp/pr-assets-push.err >&2; exit 1; }
  sleep $((2 ** attempt))
done

for path in "${PATHS[@]}"; do
  url="https://github.com/$REPO/raw/$COMMIT/$path"
  name="$(basename "$path")"
  case "$name" in
    *.png|*.webp|*.gif|*.jpg|*.jpeg) echo "![${name%.*}]($url)" ;;
    *) echo "[$name]($url)" ;;
  esac
done
