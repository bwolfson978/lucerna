#!/usr/bin/env bash
# Capture the same flows on a base ref and on the PR head, then build side-by-side pairs
# and a reel. See ../SKILL.md for when and how to use it.
#
# Usage: before-after.sh [--base <ref>] [--head <ref>] [--flows a,b] [--viewports desktop,mobile]
#                        [--video] [--run-dir <dir>]
#
#   --base   ref to compare against (default: merge-base of HEAD and origin/master)
#   --head   ref to capture as "after" (default: the current working tree, uncommitted
#            changes included)
#   --flows  flow names from e2e/capture/flows.mjs (default: picked from the changed files)
#
# Output (default run dir .qa-runs/<timestamp>/):
#   changed.txt  before/  after/  pairs/*.png  pairs/summary.json  reel.webp  [*.mp4]
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_LUCERNA="$ROOT/.agents/skills/run-lucerna/scripts"
BASE=""
HEAD_REF=""
FLOWS=""
VIEWPORTS="desktop,mobile"
VIDEO=""
RUN_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --head) HEAD_REF="$2"; shift 2 ;;
    --flows) FLOWS="$2"; shift 2 ;;
    --viewports) VIEWPORTS="$2"; shift 2 ;;
    --video) VIDEO="--video"; shift ;;
    --run-dir) RUN_DIR="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

BASE="${BASE:-$(git merge-base HEAD origin/master)}"
BASE_SHA="$(git rev-parse --short "$BASE")"
RUN_DIR="${RUN_DIR:-$ROOT/.qa-runs/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$RUN_DIR"
RUN_DIR="$(cd "$RUN_DIR" && pwd)"
export PW_CHROMIUM_PATH="${PW_CHROMIUM_PATH:-$( [[ -x /opt/pw-browsers/chromium ]] && echo /opt/pw-browsers/chromium )}"

# Repo git hooks are branch-controlled code; never run them while checking out refs.
git_nohooks() { git -c core.hooksPath=/dev/null "$@"; }

STACKS=()
WORKTREES=()
cleanup() {
  for s in "${STACKS[@]:-}"; do [[ -n "$s" ]] && "$RUN_LUCERNA/stop.sh" "$s" >/dev/null || true; done
  for w in "${WORKTREES[@]:-}"; do [[ -n "$w" ]] && git worktree remove --force "$w" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

# A checkout of <ref> with dependencies, reusing this checkout's node_modules when the
# lockfile matches (a fresh npm ci takes minutes). Turbopack refuses a symlinked
# node_modules, so it is a hard-link copy (same filesystem: keep the run dir in the repo).
checkout() {
  local ref="$1" dir="$2"
  git_nohooks worktree add --detach "$dir" "$ref" >/dev/null
  WORKTREES+=("$dir")
  if cmp -s "$dir/frontend/package-lock.json" "$ROOT/frontend/package-lock.json"; then
    cp -al "$ROOT/frontend/node_modules" "$dir/frontend/node_modules" 2>/dev/null \
      || cp -a "$ROOT/frontend/node_modules" "$dir/frontend/node_modules"
  else
    echo "frontend lockfile differs at $ref: running npm ci (slow)" >&2
    (cd "$dir/frontend" && npm ci --silent)
  fi
}

if [[ -n "$HEAD_REF" ]]; then
  HEAD_SHA="$(git rev-parse --short "$HEAD_REF")"
  HEAD_DIR="$RUN_DIR/worktree-head"
  checkout "$HEAD_REF" "$HEAD_DIR"
  git diff --name-only "$BASE" "$HEAD_REF" >"$RUN_DIR/changed.txt"
  HEAD_LABEL="AFTER  $HEAD_SHA"
else
  HEAD_DIR="$ROOT"
  { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u >"$RUN_DIR/changed.txt"
  HEAD_LABEL="AFTER  $(git rev-parse --short HEAD)$(git diff --quiet "$BASE" -- . 2>/dev/null || echo ' + local changes')"
fi
BASE_DIR="$RUN_DIR/worktree-base"
checkout "$BASE" "$BASE_DIR"

CAPTURE_ARGS=(--viewports "$VIEWPORTS")
if [[ -n "$FLOWS" ]]; then
  CAPTURE_ARGS+=(--flows "$FLOWS")
else
  CAPTURE_ARGS+=(--changed "$RUN_DIR/changed.txt")
fi

run_side() {
  local side="$1" dir="$2" web="$3" api="$4"
  local logs="$RUN_DIR/stack-$side"
  STACKS+=("$logs")
  "$RUN_LUCERNA/start.sh" --dir "$dir" --web-port "$web" --api-port "$api" --log-dir "$logs" >/dev/null
  # Warm the dev server so first-compile time is not in the frames.
  curl -sf -o /dev/null "http://localhost:$web/calculator" || true
  (cd "$ROOT/e2e" && node capture/capture.mjs --base-url "http://localhost:$web" --out "$RUN_DIR/$side" \
    "${CAPTURE_ARGS[@]}" $([[ "$side" == after ]] && echo "$VIDEO")) || echo "some $side flows failed: see $RUN_DIR/$side/manifest.json" >&2
  "$RUN_LUCERNA/stop.sh" "$logs" >/dev/null
}

echo "base $BASE_SHA -> $HEAD_LABEL; run dir $RUN_DIR"
run_side before "$BASE_DIR" 3101 8101
run_side after "$HEAD_DIR" 3102 8102

python3 "$SKILL_DIR/scripts/annotate.py" pair --before "$RUN_DIR/before" --after "$RUN_DIR/after" \
  --out "$RUN_DIR/pairs" --before-label "BEFORE  $BASE_SHA" --after-label "$HEAD_LABEL"
python3 "$SKILL_DIR/scripts/annotate.py" reel --pairs "$RUN_DIR/pairs" --out "$RUN_DIR/reel.webp"
for webm in "$RUN_DIR"/after/*.webm; do
  [[ -e "$webm" ]] || continue
  python3 "$SKILL_DIR/scripts/annotate.py" video "$webm" "$RUN_DIR/$(basename "${webm%.webm}").mp4" || true
done
echo "done: $RUN_DIR"
