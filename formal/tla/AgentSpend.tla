---------------------------- MODULE AgentSpend ----------------------------
(***************************************************************************)
(* The website assistant's limits: backend/app/agent/limits.py             *)
(* (UsageLimiter) as used by POST /api/agent (backend/app/api/agent.py).   *)
(*                                                                         *)
(* A message is admitted by check(ip, ...), under the lock, only if        *)
(* today's spend plus every reservation still held plus its own Reserve    *)
(* fits under the cap; admitting it holds Reserve. The turn then makes up  *)
(* to Calls model calls; after each one on_usage -> Turn.record_spend adds *)
(* its cost and draws the reservation down. When the turn ends, release()  *)
(* returns what it did not spend. (The code also lets a reservation lapse *)
(* after an hour in case release() never runs; not modelled.)             *)
(*                                                                         *)
(* The ip is client_ip(request): the first X-Forwarded-For entry           *)
(* (backend/app/mcp/limits.py). Railway's edge drops whatever the client   *)
(* sent there and writes the address it saw (probed 2026-10-25), so the    *)
(* key is the client's own address. The first version of this model let    *)
(* each message pick its header, which a client can't do behind Railway.   *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Msgs,          \* message ids
    Clients,       \* real people (one network address each)
    PerIp,         \* messages_per_ip_per_day
    Cap,           \* daily_spend_usd, in cost units
    Cost,          \* cost of one model call, in cost units
    Calls,         \* model calls in one turn (tool loop rounds)
    Reserve        \* turn_reserve_usd: worst_case_turn_cost, in cost units

ASSUME Reserve >= Calls * Cost

VARIABLES
    from,          \* [Msgs -> Clients]
    pc,            \* "new" | "running" | "refused" | "done"
    left,          \* model calls each running message still makes
    ipCounts,      \* UsageLimiter._ip_counts, keyed by the caller's address
    spend,         \* UsageLimiter._spend
    reserved,      \* UsageLimiter._reserved
    held,          \* Turn._held, per message
    sent           \* ghost: admitted messages per real client

vars == <<from, pc, left, ipCounts, spend, reserved, held, sent>>

Init ==
    /\ from \in [Msgs -> Clients]
    /\ pc = [m \in Msgs |-> "new"]
    /\ left = [m \in Msgs |-> 0]
    /\ ipCounts = [c \in Clients |-> 0]
    /\ spend = 0
    /\ reserved = 0
    /\ held = [m \in Msgs |-> 0]
    /\ sent = [c \in Clients |-> 0]

Check(m, ip) ==
    /\ pc[m] = "new"
    /\ IF ipCounts[ip] >= PerIp \/ spend >= Cap \/ spend + reserved + Reserve > Cap
          THEN /\ pc' = [pc EXCEPT ![m] = "refused"]
               /\ UNCHANGED <<left, ipCounts, reserved, held, sent>>
          ELSE /\ pc' = [pc EXCEPT ![m] = "running"]
               /\ left' = [left EXCEPT ![m] = Calls]
               /\ ipCounts' = [ipCounts EXCEPT ![ip] = @ + 1]
               /\ reserved' = reserved + Reserve
               /\ held' = [held EXCEPT ![m] = Reserve]
               /\ sent' = [sent EXCEPT ![from[m]] = @ + 1]
    /\ UNCHANGED <<from, spend>>

Min(a, b) == IF a < b THEN a ELSE b

ModelCall(m) ==
    /\ pc[m] = "running" /\ left[m] > 0
    /\ spend' = spend + Cost
    /\ reserved' = reserved - Min(Cost, held[m])
    /\ held' = [held EXCEPT ![m] = @ - Min(Cost, @)]
    /\ left' = [left EXCEPT ![m] = @ - 1]
    /\ UNCHANGED <<from, pc, ipCounts, sent>>

\* The turn ends after any number of calls (the model stops using tools).
Finish(m) ==
    /\ pc[m] = "running"
    /\ pc' = [pc EXCEPT ![m] = "done"]
    /\ left' = [left EXCEPT ![m] = 0]
    /\ reserved' = reserved - held[m]
    /\ held' = [held EXCEPT ![m] = 0]
    /\ UNCHANGED <<from, ipCounts, spend, sent>>

Next ==
    \/ \E m \in Msgs : Check(m, from[m])
    \/ \E m \in Msgs : ModelCall(m) \/ Finish(m)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK ==
    /\ spend \in Nat /\ reserved \in Nat
    /\ \A m \in Msgs : left[m] \in 0..Calls /\ held[m] \in 0..Reserve

\* Holds: the per-ip counter itself is never exceeded.
MessagesPerIp == \A c \in Clients : ipCounts[c] <= PerIp

\* The docstring's intent: "messages per client IP per day". Held only once
\* the key stopped being a value the client chooses.
MessagesPerClient == \A c \in Clients : sent[c] <= PerIp

\* "estimated model spend per day across everyone".
SpendWithinCap == spend <= Cap

\* The weaker promise a check-before-spend design without reservations
\* could at best make: one turn may finish over the cap.
SpendWithinOneMessage == spend <= Cap + Calls * Cost
=============================================================================
