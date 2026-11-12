---------------------------- MODULE ReplyRating ----------------------------
(***************************************************************************)
(* Rating one website assistant reply: the thumbs and the feedback dialog  *)
(* (frontend/src/lib/agent/replyRating.ts, backend/app/agent/feedback.py). *)
(*                                                                         *)
(*  - Each tap or dialog submit sets what the person picked: a rating      *)
(*    with its reason and note, or nothing (the thumb tapped off).         *)
(*  - The page sends one request at a time per reply, each with a higher   *)
(*    sequence number. When it settles, it sends the latest pick again if  *)
(*    the server hasn't confirmed that one.                                *)
(*  - A request the page gave up on (timeout, network error) can still     *)
(*    reach the server later, so after a failure the page no longer knows  *)
(*    what the server holds and sends the latest pick again.               *)
(*  - The server keeps the highest sequence number it has applied for each *)
(*    reply and ignores a request with a lower one.                        *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS Values, None, Unknown, MaxSends

VARIABLES
    picked,     \* the person's latest choice in the page
    acked,      \* what the page knows the server holds (Unknown after a failure)
    inflight,   \* a request from the page is still awaiting its answer
    current,    \* that request
    seq,        \* last sequence number the page used
    net,        \* requests on the wire; they arrive in any order, late or never
    answered,   \* sequence numbers the server answered
    stored,     \* the score the server holds
    storedSeq,  \* the sequence number it came with
    alive       \* the page is still open

vars == <<picked, acked, inflight, current, seq, net, answered, stored, storedSeq, alive>>

Choices == Values \cup {None}
Msg == [v : Choices, s : 1..MaxSends]

Init ==
    /\ picked = None /\ acked = None /\ inflight = FALSE
    /\ current = [v |-> None, s |-> 1]
    /\ seq = 0 /\ net = {} /\ answered = {}
    /\ stored = None /\ storedSeq = 0 /\ alive = TRUE

Pick(v) ==
    /\ alive
    /\ picked' = v
    /\ UNCHANGED <<acked, inflight, current, seq, net, answered, stored, storedSeq, alive>>

Send ==
    /\ alive /\ ~inflight /\ picked # acked /\ seq < MaxSends
    /\ seq' = seq + 1
    /\ current' = [v |-> picked, s |-> seq + 1]
    /\ net' = net \cup {[v |-> picked, s |-> seq + 1]}
    /\ inflight' = TRUE
    /\ UNCHANGED <<picked, acked, answered, stored, storedSeq, alive>>

\* The server applies a request unless it has applied a newer one, and answers it.
Arrive(m) ==
    /\ m \in net
    /\ net' = net \ {m}
    /\ IF m.s > storedSeq THEN stored' = m.v /\ storedSeq' = m.s
                          ELSE UNCHANGED <<stored, storedSeq>>
    /\ answered' = answered \cup {m.s}
    /\ UNCHANGED <<picked, acked, inflight, current, seq, alive>>

\* The answer reaches the page.
Confirmed ==
    /\ alive /\ inflight /\ current.s \in answered
    /\ acked' = current.v
    /\ inflight' = FALSE
    /\ UNCHANGED <<picked, current, seq, net, answered, stored, storedSeq, alive>>

\* The page gives up on the request, which may still be on the wire.
Failed ==
    /\ alive /\ inflight
    /\ acked' = Unknown
    /\ inflight' = FALSE
    /\ UNCHANGED <<picked, current, seq, net, answered, stored, storedSeq, alive>>

PageHide ==
    /\ alive
    /\ alive' = FALSE
    /\ UNCHANGED <<picked, acked, inflight, current, seq, net, answered, stored, storedSeq>>

Next ==
    \/ \E v \in Choices : Pick(v)
    \/ Send \/ Confirmed \/ Failed \/ PageHide
    \/ \E m \in net : Arrive(m)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK ==
    /\ picked \in Choices /\ acked \in Choices \cup {Unknown}
    /\ stored \in Choices /\ net \subseteq Msg /\ seq \in 0..MaxSends

\* What the page believes the server holds is what the server holds, once no
\* request is awaiting its answer or still on the wire.
AckedIsTrue == (acked # Unknown /\ ~inflight /\ net = {}) => stored = acked

\* Once the page is quiet (nothing in flight, nothing on the wire, the latest
\* pick confirmed), the server holds the person's latest pick.
LastPickWins ==
    (alive /\ ~inflight /\ net = {} /\ acked = picked) => stored = picked

\* The page never has two requests of its own awaiting answers.
OneAtATime == inflight => current.s = seq
=============================================================================
