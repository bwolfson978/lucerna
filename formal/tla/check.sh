#!/usr/bin/env bash
# Model-check every spec here with TLC, one invariant at a time, so each broken
# property gets its own shortest counterexample. Exits non-zero unless every
# invariant holds.
#
#   formal/tla/check.sh                 # all specs
#   formal/tla/check.sh McpLimits       # one spec
#
# Needs Java 11+ and tla2tools.jar (TLA_JAR, default ~/tools/tla2tools.jar);
# .agents/skills/formal-models/scripts/install.sh sets both up.
set -uo pipefail
cd "$(dirname "$0")"
JAR="${TLA_JAR:-$HOME/tools/tla2tools.jar}"
OUT=out
mkdir -p "$OUT"

# spec : invariants. Every one must hold: there is no expected-to-fail list. A
# broken invariant is fixed in the code, or rewritten to say what we accept.
SPECS=(
  "McpLimits:TypeOK CallerAllowance AnonymousCeiling EveryFreshRunIsCharged FreshRunsHoldASlot RefundsStayOnTheirDay NoChargeWithoutARun"
  "AgentSpend:TypeOK MessagesPerIp MessagesPerClient SpendWithinCap SpendWithinOneMessage"
  "AutoSave:TypeOK NoDuplicateSaves NoSilentLoss NoSilentLossWhenStorageFits NoSilentLossWhenSavesSucceed"
  "UndoDelete:TypeOK HiddenWhilePending DeletedStayGone ServerMatchesIntent"
)

status=0
for entry in "${SPECS[@]}"; do
  IFS=: read -r spec invariants <<<"$entry"
  [[ $# -gt 0 && "$1" != "$spec" ]] && continue
  for inv in $invariants; do
    cfg="$OUT/$spec-$inv.cfg"
    sed '/^INVARIANTS/d' "$spec.cfg" >"$cfg"
    echo "INVARIANTS $inv" >>"$cfg"
    log="$OUT/$spec-$inv.log"
    java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto -deadlock \
      -metadir "$OUT/states-$spec-$inv" -config "$cfg" "$spec.tla" >"$log" 2>&1
    # Only TLC's own success line counts as holding, so a crash or parse error fails too.
    if grep -q "No error has been found" "$log"; then got=hold
    elif grep -q "is violated" "$log"; then got=BROKEN
    else got=ERROR; fi
    [[ $got != hold ]] && status=1
    printf '%-11s %-28s %s\n' "$spec" "$inv" "$got"
    [[ $got != hold ]] && echo "            see formal/tla/$log"
  done
done
rm -f ./*_TTrace_*.tla ./*_TTrace_*.bin  # TLC 1.8 writes these next to the spec; the logs have the traces
exit $status
