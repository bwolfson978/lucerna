---------------------------- MODULE AgentSpend ----------------------------
(***************************************************************************)
(* The website assistant's limits: backend/app/agent/limits.py             *)
(* (UsageLimiter) as used by POST /api/agent (backend/app/api/agent.py).    *)
(*                                                                         *)
(* A message is admitted by check(ip, ...), under the lock, if today's     *)
(* spend is still below the cap. The turn then makes up to Calls model     *)
(* calls; after each one on_usage -> record_spend adds its cost. Nothing   *)
(* re-checks the cap between calls or holds a reservation for messages in  *)
(* flight.                                                                 *)
(*                                                                         *)
(* The ip is client_ip(request): the FIRST X-Forwarded-For entry           *)
(* (backend/app/mcp/limits.py). A client can send any value there, so in   *)
(* the model each message picks its header from Ips.                       *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    Msgs,          \* message ids
    Clients,       \* real people (one network address each)
    Ips,           \* values a client can put first in X-Forwarded-For
    PerIp,         \* messages_per_ip_per_day
    Cap,           \* daily_spend_usd, in cost units
    Cost,          \* cost of one model call, in cost units
    Calls          \* model calls in one turn (tool loop rounds)

VARIABLES
    from,          \* [Msgs -> Clients]
    pc,            \* "new" | "running" | "refused" | "done"
    left,          \* model calls each running message still makes
    ipCounts,      \* UsageLimiter._ip_counts, keyed by the header value
    spend,         \* UsageLimiter._spend
    sent           \* ghost: admitted messages per real client

vars == <<from, pc, left, ipCounts, spend, sent>>

Init ==
    /\ from \in [Msgs -> Clients]
    /\ pc = [m \in Msgs |-> "new"]
    /\ left = [m \in Msgs |-> 0]
    /\ ipCounts = [i \in Ips |-> 0]
    /\ spend = 0
    /\ sent = [c \in Clients |-> 0]

Check(m, ip) ==
    /\ pc[m] = "new"
    /\ IF ipCounts[ip] >= PerIp \/ spend >= Cap
          THEN /\ pc' = [pc EXCEPT ![m] = "refused"]
               /\ UNCHANGED <<left, ipCounts, sent>>
          ELSE /\ pc' = [pc EXCEPT ![m] = "running"]
               /\ left' = [left EXCEPT ![m] = Calls]
               /\ ipCounts' = [ipCounts EXCEPT ![ip] = @ + 1]
               /\ sent' = [sent EXCEPT ![from[m]] = @ + 1]
    /\ UNCHANGED <<from, spend>>

ModelCall(m) ==
    /\ pc[m] = "running" /\ left[m] > 0
    /\ spend' = spend + Cost
    /\ left' = [left EXCEPT ![m] = @ - 1]
    /\ UNCHANGED <<from, pc, ipCounts, sent>>

\* The turn ends after any number of calls (the model stops using tools).
Finish(m) ==
    /\ pc[m] = "running"
    /\ pc' = [pc EXCEPT ![m] = "done"]
    /\ left' = [left EXCEPT ![m] = 0]
    /\ UNCHANGED <<from, ipCounts, spend, sent>>

Next ==
    \/ \E m \in Msgs, ip \in Ips : Check(m, ip)
    \/ \E m \in Msgs : ModelCall(m) \/ Finish(m)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK == spend \in Nat /\ \A m \in Msgs : left[m] \in 0..Calls

\* Holds: the per-ip counter itself is never exceeded.
MessagesPerIp == \A i \in Ips : ipCounts[i] <= PerIp

\* The docstring's intent: "messages per client IP per day". Fails when a
\* client can choose its X-Forwarded-For value.
MessagesPerClient == \A c \in Clients : sent[c] <= PerIp

\* "estimated model spend per day across everyone".
SpendWithinCap == spend <= Cap

\* The most a check-before-spend design can promise: one turn may finish
\* over the cap. Fails as soon as two turns are in flight together.
SpendWithinOneMessage == spend <= Cap + Calls * Cost
=============================================================================
