#!/usr/bin/env bash
# Stop a stack started by start.sh. Usage: stop.sh <log-dir printed by start.sh>
set -uo pipefail
LOG_DIR="${1:?usage: stop.sh <log-dir>}"
for svc in frontend backend; do
  pid_file="$LOG_DIR/$svc.pid"
  [[ -f "$pid_file" ]] || continue
  pid="$(cat "$pid_file")"
  # start.sh runs each service in its own session (setsid, or Perl's on macOS), so the group id is its pid:
  # this stops npx, next and their workers, not just the launcher.
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  rm -f "$pid_file"
done
echo "stopped stack in $LOG_DIR"
