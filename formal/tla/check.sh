#!/usr/bin/env bash
# Model-check every spec here with TLC, one invariant at a time, so each broken
# property gets its own shortest counterexample.
#
#   formal/tla/check.sh                 # all specs
#   formal/tla/check.sh McpLimits       # one spec
#
# Needs Java 11+ and tla2tools.jar (TLA_JAR, default ~/tools/tla2tools.jar):
#   curl -sSL -o ~/tools/tla2tools.jar \
#     https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar
set -uo pipefail
cd "$(dirname "$0")"
JAR="${TLA_JAR:-$HOME/tools/tla2tools.jar}"
OUT=out
mkdir -p "$OUT"

# spec : invariants expected to HOLD : invariants expected to FAIL (known bugs)
SPECS=(
  "McpLimits:TypeOK CallerAllowance AnonymousCeiling:EveryFreshRunIsCharged FreshRunsHoldASlot RefundsStayOnTheirDay NoChargeWithoutARun"
  "AgentSpend:TypeOK MessagesPerIp:MessagesPerClient SpendWithinCap SpendWithinOneMessage"
  "AutoSave:TypeOK:NoSilentLoss NoSilentLossWhenStorageFits NoSilentLossWhenSavesSucceed NoDuplicateSaves"
  "UndoDelete:TypeOK HiddenWhilePending DeletedStayGone:ServerMatchesIntent"
)

status=0
for entry in "${SPECS[@]}"; do
  IFS=: read -r spec holds fails <<<"$entry"
  [[ $# -gt 0 && "$1" != "$spec" ]] && continue
  for inv in $holds $fails; do
    cfg="$OUT/$spec-$inv.cfg"
    sed '/^INVARIANTS/d' "$spec.cfg" >"$cfg"
    echo "INVARIANTS $inv" >>"$cfg"
    log="$OUT/$spec-$inv.log"
    java -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto -deadlock \
      -metadir "$OUT/states-$spec-$inv" -config "$cfg" "$spec.tla" >"$log" 2>&1
    if grep -q "is violated" "$log"; then got=fail; else got=hold; fi
    if grep -q "Error:" "$log" && [[ $got == hold ]]; then got=error; fi
    want=hold; [[ " $fails " == *" $inv "* ]] && want=fail
    mark=ok; [[ $got != "$want" ]] && { mark=UNEXPECTED; status=1; }
    printf '%-11s %-28s %-5s (expected %s)  %s\n' "$spec" "$inv" "$got" "$want" "$mark"
  done
done
exit $status
