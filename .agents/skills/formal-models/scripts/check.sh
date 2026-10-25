#!/usr/bin/env bash
# Run every formal model: TLC on the TLA+ specs, then the Lean proofs.
# Exits non-zero if any invariant breaks, TLC errors, or a proof fails or
# uses `sorry` (`--wfail` turns that warning into an error).
set -uo pipefail
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
export PATH="$HOME/.elan/bin:$PATH"
status=0

echo "== TLA+ (formal/tla/check.sh)"
"$root/formal/tla/check.sh" || status=1

echo "== Lean (lake build --wfail)"
(cd "$root/formal/lean" && lake build --wfail) || status=1

[[ $status == 0 ]] && echo "All models hold." || echo "A model failed; see above."
exit $status
