#!/usr/bin/env bash
# Install what the formal models need: tla2tools.jar for TLC, and elan for Lean.
# Skips what is already there, so it is safe to re-run. CI runs it too.
#
#   .agents/skills/formal-models/scripts/install.sh
#   .agents/skills/formal-models/scripts/install.sh --check   # report only
#
# Downloads: tla2tools.jar v1.7.4 from GitHub (SHA-256 checked; v1.8.0 is a rolling
# nightly whose jar changes, so it cannot be pinned) and elan
# from its GitHub repo. elan fetches the Lean toolchain pinned in
# formal/lean/lean-toolchain (about 3 GB unpacked) on the first `lake build`.
set -euo pipefail
TLA_VERSION=v1.7.4
TLA_SHA256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
JAR="${TLA_JAR:-$HOME/tools/tla2tools.jar}"
check_only=false; [[ "${1:-}" == --check ]] && check_only=true
missing=0

if command -v java >/dev/null && java -version 2>&1 | grep -qE 'version "(1[1-9]|[2-9][0-9])'; then
  echo "java      ok"
else
  echo "java      MISSING: install Java 11 or newer (TLC needs it)"; missing=1
fi

jar_ok() { [[ -f "$JAR" ]] && echo "$TLA_SHA256  $JAR" | sha256sum -c --status 2>/dev/null; }
if jar_ok; then
  echo "tla2tools ok ($JAR)"
elif $check_only; then
  echo "tla2tools MISSING ($JAR)"; missing=1
else
  mkdir -p "$(dirname "$JAR")"
  curl -sSfL -o "$JAR.tmp" \
    "https://github.com/tlaplus/tlaplus/releases/download/$TLA_VERSION/tla2tools.jar"
  mv "$JAR.tmp" "$JAR"
  jar_ok || { echo "tla2tools.jar SHA-256 mismatch; removed it" >&2; rm -f "$JAR"; exit 1; }
  echo "tla2tools installed ($JAR)"
fi

export PATH="$HOME/.elan/bin:$PATH"
if command -v lake >/dev/null; then
  echo "elan      ok"
elif $check_only; then
  echo "elan      MISSING"; missing=1
else
  curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
    | sh -s -- -y --default-toolchain none --no-modify-path >/dev/null
  echo "elan      installed (~/.elan/bin; add it to PATH)"
fi

exit $missing
