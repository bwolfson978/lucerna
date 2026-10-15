#!/usr/bin/env bash
# Start Lucerna (FastAPI backend + Next.js frontend) from a checkout and wait until both serve.
#
# Usage: start.sh [--dir <checkout>] [--web-port 3000] [--api-port 8000] [--log-dir <dir>]
#
# The backend runs with the offline agent (AGENT_OFFLINE=1): a rule-based stand-in for the
# model, so conversations are deterministic and need no API key. Two checkouts can run side
# by side on different ports (pr-evidence boots the base branch and the PR head this way).
# Prints the web and API URLs on success; stop.sh with the same --log-dir stops both.
set -euo pipefail

# Toolchain from setup-lucerna (backend venv, Node in ~/.local) and a Playwright browser.
source "$(dirname "${BASH_SOURCE[0]}")/../../setup-lucerna/scripts/env.sh"

# Run a command in its own session so stop.sh can stop its whole process group.
# macOS has no setsid(1); Perl's POSIX::setsid does the same and ships with macOS.
detach() {
  if command -v setsid >/dev/null; then
    exec setsid nohup "$@"
  else
    exec nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec: $!"' "$@"
  fi
}

DIR="$(git rev-parse --show-toplevel)"
WEB_PORT=3000
API_PORT=8000
LOG_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DIR="$(cd "$2" && pwd)"; shift 2 ;;
    --web-port) WEB_PORT="$2"; shift 2 ;;
    --api-port) API_PORT="$2"; shift 2 ;;
    --log-dir) LOG_DIR="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
LOG_DIR="${LOG_DIR:-$DIR/.qa-runs/stack-$WEB_PORT}"
mkdir -p "$LOG_DIR"
LOG_DIR="$(cd "$LOG_DIR" && pwd)"

if [[ ! -d "$DIR/frontend/node_modules" ]]; then
  echo "frontend/node_modules missing in $DIR: run .agents/skills/setup-lucerna/scripts/setup.sh" >&2
  exit 1
fi
if ! python -c 'import fastapi' 2>/dev/null; then
  echo "no Python with the backend's packages on PATH: run .agents/skills/setup-lucerna/scripts/setup.sh" >&2
  exit 1
fi

# The backend's MCP server and the web agent's MCP client talk over HTTP, as in e2e.
(
  cd "$DIR/backend"
  AGENT_OFFLINE=1 \
  AGENT_MCP_URL="http://localhost:$API_PORT/mcp" \
  MCP_INTERNAL_TOKEN=local-internal \
  ALLOWED_ORIGINS="http://localhost:$WEB_PORT" \
  SITE_URL="http://localhost:$WEB_PORT" \
    detach python -m uvicorn app.main:app --port "$API_PORT" >"$LOG_DIR/backend.log" 2>&1 &
  echo $! >"$LOG_DIR/backend.pid"
)
(
  cd "$DIR/frontend"
  NEXT_PUBLIC_API_URL="http://localhost:$API_PORT" \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="" \
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN="" \
    detach npx next dev -p "$WEB_PORT" >"$LOG_DIR/frontend.log" 2>&1 &
  echo $! >"$LOG_DIR/frontend.pid"
)

wait_for() {
  local url="$1" name="$2" log="$3"
  for _ in $(seq 1 120); do
    if curl -sf -o /dev/null "$url"; then return 0; fi
    sleep 1
  done
  echo "$name did not come up at $url; last log lines:" >&2
  tail -20 "$log" >&2
  return 1
}
wait_for "http://localhost:$API_PORT/health" backend "$LOG_DIR/backend.log"
wait_for "http://localhost:$WEB_PORT/" frontend "$LOG_DIR/frontend.log"

echo "web=http://localhost:$WEB_PORT"
echo "api=http://localhost:$API_PORT"
echo "logs=$LOG_DIR"
