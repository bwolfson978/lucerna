# Put the toolchain setup.sh installs on PATH. Source it, don't run it:
#   source .agents/skills/setup-lucerna/scripts/env.sh
#
# Adds, when present: the backend virtualenv (python, uvicorn, ruff, pytest), a Node
# installed into ~/.local/node, and ~/.local/bin (uv). Safe to source more than once and
# from any directory or worktree: paths are taken from this file's location.
_lucerna_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../../../.." && pwd)"
for _dir in "$HOME/.local/bin" "$HOME/.local/node/bin" "$_lucerna_root/backend/.venv/bin"; do
  if [[ -d "$_dir" && ":$PATH:" != *":$_dir:"* ]]; then
    PATH="$_dir:$PATH"
  fi
done
export PATH

# Playwright browser: the cloud image's Chromium, else Google Chrome on macOS. Never
# download one (no `playwright install`).
if [[ -z "${PW_CHROMIUM_PATH:-}" ]]; then
  for _bin in /opt/pw-browsers/chromium \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if [[ -x "$_bin" ]]; then export PW_CHROMIUM_PATH="$_bin"; break; fi
  done
fi
unset _lucerna_root _dir _bin
