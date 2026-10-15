#!/usr/bin/env bash
# Set up a fresh checkout of Lucerna: toolchain, dependencies, git hooks.
#
# Usage: .agents/skills/setup-lucerna/scripts/setup.sh [--check] [--skip-install]
#
#   --check         report what is missing and exit (non-zero if anything is), change nothing
#   --skip-install  don't download Node or uv; fail if they are missing instead
#
# What it does, each step skipped when already done:
#   1. Node 20+: uses the one on PATH, else installs the latest Node 20 into ~/.local/node
#      (official nodejs.org tarball, SHA-256 checked).
#   2. uv: uses the one on PATH, else installs it into ~/.local/bin (GitHub release,
#      SHA-256 checked). uv provides Python 3.11 for the backend; no system Python needed.
#   3. backend/.venv: Python 3.11 virtualenv with requirements-dev.txt and the app itself.
#   4. npm ci in the root (husky hooks), frontend/, e2e/ and mcp-views/.
#
# Everything lands in your home folder or the checkout: no sudo, no Homebrew, no shell
# profile edits. Afterwards, `source .agents/skills/setup-lucerna/scripts/env.sh` puts
# the tools on PATH (run-lucerna and pr-evidence do this themselves).
set -euo pipefail

NODE_MAJOR=20
PYTHON_VERSION=3.11
CHECK=""
SKIP_INSTALL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK=1; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
# shellcheck source=env.sh
source "$SCRIPT_DIR/env.sh"

step() { printf '\n== %s\n' "$*"; }
missing=()

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH=arm64 ;;
  x86_64 | amd64) ARCH=x64 ;;
  *) echo "unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

# Download $1 into $2 and check it against the SHA-256 $3.
fetch_verified() {
  curl -fsSL --retry 3 -o "$2" "$1"
  local got
  got="$(sha256 "$2")"
  [[ "$got" == "$3" ]] || { echo "checksum mismatch for $1 (got $got, want $3)" >&2; exit 1; }
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- 1. Node -----------------------------------------------------------------------------
step "Node $NODE_MAJOR"
node_ok() { command -v node >/dev/null && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge $NODE_MAJOR ]]; }
if node_ok; then
  echo "using $(command -v node) ($(node --version))"
elif [[ -n "$CHECK" || -n "$SKIP_INSTALL" ]]; then
  missing+=("Node $NODE_MAJOR+")
  echo "missing"
else
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  line="$(curl -fsSL --retry 3 "$base/SHASUMS256.txt" | grep " node-v.*-$OS-$ARCH.tar.gz$")"
  file="${line##* }"
  echo "installing $file into ~/.local/node"
  fetch_verified "$base/$file" "$TMP/$file" "${line%% *}"
  mkdir -p "$HOME/.local"
  tar -xzf "$TMP/$file" -C "$TMP"
  rm -rf "$HOME/.local/node"
  mv "$TMP/${file%.tar.gz}" "$HOME/.local/node"
  source "$SCRIPT_DIR/env.sh"
  node_ok || { echo "Node install failed" >&2; exit 1; }
  echo "installed $(node --version)"
fi

# --- 2. uv -------------------------------------------------------------------------------
step "uv (provides Python $PYTHON_VERSION)"
if command -v uv >/dev/null; then
  echo "using $(command -v uv) ($(uv --version))"
elif [[ -n "$CHECK" || -n "$SKIP_INSTALL" ]]; then
  missing+=("uv")
  echo "missing"
else
  case "$OS-$ARCH" in
    darwin-arm64) target=aarch64-apple-darwin ;;
    darwin-x64) target=x86_64-apple-darwin ;;
    linux-arm64) target=aarch64-unknown-linux-gnu ;;
    linux-x64) target=x86_64-unknown-linux-gnu ;;
  esac
  rel="https://github.com/astral-sh/uv/releases/latest/download/uv-$target.tar.gz"
  want="$(curl -fsSL --retry 3 "$rel.sha256" | cut -d' ' -f1)"
  echo "installing uv into ~/.local/bin"
  fetch_verified "$rel" "$TMP/uv.tar.gz" "$want"
  tar -xzf "$TMP/uv.tar.gz" -C "$TMP"
  mkdir -p "$HOME/.local/bin"
  cp "$TMP/uv-$target/uv" "$TMP/uv-$target/uvx" "$HOME/.local/bin/"
  source "$SCRIPT_DIR/env.sh"
  echo "installed $(uv --version)"
fi

# --- 3. Backend virtualenv -----------------------------------------------------------------
step "backend/.venv (Python $PYTHON_VERSION)"
VENV="$ROOT/backend/.venv"
if [[ -n "$CHECK" ]]; then
  if [[ -x "$VENV/bin/python" ]] && "$VENV/bin/python" -c 'import fastapi, PIL' 2>/dev/null; then
    echo "ok ($("$VENV/bin/python" --version))"
  else
    missing+=("backend/.venv")
    echo "missing or incomplete"
  fi
elif command -v uv >/dev/null; then
  [[ -x "$VENV/bin/python" ]] || uv venv --quiet --python "$PYTHON_VERSION" "$VENV"
  uv pip install --quiet --python "$VENV/bin/python" -r "$ROOT/backend/requirements-dev.txt"
  uv pip install --quiet --python "$VENV/bin/python" -e "$ROOT/backend"
  echo "ok ($("$VENV/bin/python" --version))"
else
  missing+=("backend/.venv (needs uv)")
fi

# --- 4. npm packages -----------------------------------------------------------------------
for dir in . frontend e2e mcp-views; do
  step "npm packages: $dir"
  if [[ -n "$CHECK" ]]; then
    if [[ -d "$ROOT/$dir/node_modules" ]]; then echo "ok"; else missing+=("$dir/node_modules"); echo "missing"; fi
  elif command -v npm >/dev/null; then
    (cd "$ROOT/$dir" && npm ci --no-audit --no-fund --loglevel=error)
  else
    missing+=("$dir/node_modules (needs Node)")
  fi
done

# --- Summary -----------------------------------------------------------------------------
step "Summary"
if [[ -n "${PW_CHROMIUM_PATH:-}" ]]; then
  echo "browser for screenshots: $PW_CHROMIUM_PATH"
else
  echo "browser for screenshots: none found (install Google Chrome to use pr-evidence locally)"
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  printf 'missing: %s\n' "${missing[@]}"
  exit 1
fi
echo "ready. In a new shell: source .agents/skills/setup-lucerna/scripts/env.sh"
echo "then start the app with .agents/skills/run-lucerna/scripts/start.sh"
