---------------------------- MODULE McpLimits ----------------------------
(***************************************************************************)
(* The MCP analysis limits: backend/app/mcp/limits.py (AnalysisLimiter)    *)
(* and the caller in backend/app/mcp/server.py (_run_drafts).              *)
(*                                                                         *)
(* One request runs one draft. Its steps, as in the code:                  *)
(*                                                                         *)
(*   check    core.cached_result(input): a hit is held and returned with  *)
(*            no charge and no slot; a miss is fresh       (server.py)     *)
(*   charge   AnalysisLimiter.charge(caller, runs)     (limits.py)         *)
(*   acquire  slots.acquire() under fail_after(queue_seconds);             *)
(*            on timeout or cancellation refund(caller, runs, day)         *)
(*   compute  core.run_optimization(input): cache hit or a fresh optimize  *)
(*   release  slots.release()                                               *)
(*                                                                         *)
(* The environment can evict cache entries (other scenarios filling the    *)
(* 64-entry LRU), move the clock past midnight UTC, and cancel a request   *)
(* that is waiting for a slot (client disconnect).                         *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Reqs,          \* request ids
    Callers,       \* anonymous caller keys ("ip:...")
    Keys,          \* scenario keys
    Allow,         \* per_anonymous_caller_per_day
    AnonCap,       \* anonymous_per_day
    Slots,         \* max_concurrent
    MaxDay         \* how many day rollovers to explore

VARIABLES
    caller,        \* [Reqs -> Callers], fixed per request
    key,           \* [Reqs -> Keys], fixed per request
    pc,            \* request program counter
    runs,          \* runs charged by each request (0 or 1)
    chargedDay,    \* the day each charge was booked against
    clock,         \* the real UTC day
    limDay,        \* AnalysisLimiter._day (rolled lazily, only inside charge)
    counts,        \* AnalysisLimiter._counts
    anonTotal,     \* AnalysisLimiter._anonymous_total
    free,          \* free semaphore slots
    holds,         \* requests holding a slot
    cache,         \* keys in the result cache
    \* ghost variables: what the code never records but the properties need
    uncharged,     \* fresh optimizer runs that nobody paid for
    unslotted,     \* fresh optimizer runs that ran without a slot
    paidNothing,   \* charges kept although the request never ran
    crossDay       \* refunds credited to a day other than the one charged

vars == <<caller, key, pc, runs, chargedDay, clock, limDay, counts, anonTotal,
          free, holds, cache, uncharged, unslotted, paidNothing, crossDay>>

Init ==
    /\ caller \in [Reqs -> Callers]
    /\ key \in [Reqs -> Keys]
    /\ pc = [r \in Reqs |-> "check"]
    /\ runs = [r \in Reqs |-> 0]
    /\ chargedDay = [r \in Reqs |-> 0]
    /\ clock = 0 /\ limDay = 0
    /\ counts = [c \in Callers |-> 0]
    /\ anonTotal = 0
    /\ free = Slots /\ holds = {}
    /\ cache = {}
    /\ uncharged = 0 /\ unslotted = 0 /\ paidNothing = 0 /\ crossDay = 0

\* cached_result(input): a hit hands back the result itself, so a later
\* eviction can't turn it into a run; the request is done. A miss is fresh.
Check(r) ==
    /\ pc[r] = "check"
    /\ IF key[r] \in cache
          THEN /\ pc' = [pc EXCEPT ![r] = "done"]
               /\ UNCHANGED runs
          ELSE /\ pc' = [pc EXCEPT ![r] = "charge"]
               /\ runs' = [runs EXCEPT ![r] = 1]
    /\ UNCHANGED <<caller, key, chargedDay, clock, limDay, counts, anonTotal,
                   free, holds, cache, uncharged, unslotted, paidNothing, crossDay>>

\* charge(): _roll_day() then the two checks, all under the lock.
Charge(r) ==
    /\ pc[r] = "charge" /\ runs[r] > 0
    /\ LET rolled == limDay # clock
           cnt    == IF rolled THEN [c \in Callers |-> 0] ELSE counts
           tot    == IF rolled THEN 0 ELSE anonTotal
           c      == caller[r]
       IN  /\ limDay' = clock
           /\ IF cnt[c] + runs[r] > Allow \/ tot + runs[r] > AnonCap
                 THEN /\ pc' = [pc EXCEPT ![r] = "refused"]
                      /\ counts' = cnt /\ anonTotal' = tot
                      /\ UNCHANGED chargedDay
                 ELSE /\ pc' = [pc EXCEPT ![r] = "acquire"]
                      /\ counts' = [cnt EXCEPT ![c] = @ + runs[r]]
                      /\ anonTotal' = tot + runs[r]
                      /\ chargedDay' = [chargedDay EXCEPT ![r] = clock]
    /\ UNCHANGED <<caller, key, runs, clock, free, holds, cache,
                   uncharged, unslotted, paidNothing, crossDay>>

Acquire(r) ==
    /\ pc[r] = "acquire" /\ free > 0
    /\ free' = free - 1 /\ holds' = holds \cup {r}
    /\ pc' = [pc EXCEPT ![r] = "compute"]
    /\ UNCHANGED <<caller, key, runs, chargedDay, clock, limDay, counts, anonTotal,
                   cache, uncharged, unslotted, paidNothing, crossDay>>

\* refund(caller, runs, day): _roll_day(), then give back only a charge booked
\* on the limiter's current day. After midnight the old day's counts are gone.
Refund(r, outcome) ==
    /\ LET rolled == limDay # clock
           cnt    == IF rolled THEN [c \in Callers |-> 0] ELSE counts
           tot    == IF rolled THEN 0 ELSE anonTotal
           same   == chargedDay[r] = clock
       IN  /\ limDay' = clock
           /\ counts' = IF same
                           THEN [cnt EXCEPT ![caller[r]] = IF @ >= runs[r] THEN @ - runs[r] ELSE 0]
                           ELSE cnt
           /\ anonTotal' = IF same THEN (IF tot >= runs[r] THEN tot - runs[r] ELSE 0) ELSE tot
           \* ghosts judge the counters, not the branch taken above
           /\ crossDay' = crossDay + (IF ~same /\ anonTotal' < tot THEN 1 ELSE 0)
           /\ paidNothing' = paidNothing +
                 (IF same /\ counts'[caller[r]] + runs[r] > cnt[caller[r]] THEN 1 ELSE 0)
    /\ pc' = [pc EXCEPT ![r] = outcome]
    /\ UNCHANGED <<caller, key, runs, chargedDay, clock, free, holds, cache,
                   uncharged, unslotted>>

\* fail_after(queue_seconds) fires.
Timeout(r) == pc[r] = "acquire" /\ free = 0 /\ Refund(r, "refused")

\* The client goes away while waiting: anyio cancels the scope, and admit()
\* refunds on any exception before re-raising.
Cancel(r) == pc[r] = "acquire" /\ Refund(r, "cancelled")

\* _ResultCache.get_or_compute: a hit is free, a miss runs optimize().
Compute(r) ==
    /\ pc[r] = "compute"
    /\ IF key[r] \in cache
          THEN UNCHANGED <<cache, uncharged, unslotted>>
          ELSE /\ cache' = cache \cup {key[r]}
               /\ uncharged' = uncharged + (IF runs[r] = 0 THEN 1 ELSE 0)
               /\ unslotted' = unslotted + (IF r \notin holds THEN 1 ELSE 0)
    /\ pc' = [pc EXCEPT ![r] = "release"]
    /\ UNCHANGED <<caller, key, runs, chargedDay, clock, limDay, counts, anonTotal,
                   free, holds, paidNothing, crossDay>>

Release(r) ==
    /\ pc[r] = "release"
    /\ IF r \in holds THEN free' = free + 1 /\ holds' = holds \ {r}
                      ELSE UNCHANGED <<free, holds>>
    /\ pc' = [pc EXCEPT ![r] = "done"]
    /\ UNCHANGED <<caller, key, runs, chargedDay, clock, limDay, counts, anonTotal,
                   cache, uncharged, unslotted, paidNothing, crossDay>>

\* Other traffic pushes a key out of the LRU.
Evict(k) ==
    /\ k \in cache
    /\ cache' = cache \ {k}
    /\ UNCHANGED <<caller, key, pc, runs, chargedDay, clock, limDay, counts, anonTotal,
                   free, holds, uncharged, unslotted, paidNothing, crossDay>>

Midnight ==
    /\ clock < MaxDay
    /\ clock' = clock + 1
    /\ UNCHANGED <<caller, key, pc, runs, chargedDay, limDay, counts, anonTotal,
                   free, holds, cache, uncharged, unslotted, paidNothing, crossDay>>

Next ==
    \/ \E r \in Reqs : Check(r) \/ Charge(r) \/ Acquire(r)
                       \/ Timeout(r) \/ Cancel(r) \/ Compute(r) \/ Release(r)
    \/ \E k \in Keys : Evict(k)
    \/ Midnight

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties. Each one is a promise in limits.py's docstring.             *)

TypeOK ==
    /\ free \in 0..Slots
    /\ holds \subseteq Reqs
    /\ Cardinality(holds) + free = Slots

\* "Only fresh optimizer runs count": every fresh run is paid for.
EveryFreshRunIsCharged == uncharged = 0

\* "analyses running at once" are capped: no fresh run without a slot.
FreshRunsHoldASlot == unslotted = 0

\* A refund gives back what the same day charged.
RefundsStayOnTheirDay == crossDay = 0

\* A charge is kept only when the analysis ran.
NoChargeWithoutARun == paidNothing = 0

\* The ceilings the counters enforce (these hold).
CallerAllowance == \A c \in Callers : counts[c] <= Allow
AnonymousCeiling == anonTotal <= AnonCap
=============================================================================
