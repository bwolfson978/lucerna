---------------------------- MODULE UndoDelete ----------------------------
(***************************************************************************)
(* Deleting saved scenarios with undo: frontend/src/app/my-scenarios/      *)
(* page.tsx (handleDelete, undo, commit, the pagehide flush).              *)
(*                                                                         *)
(*  - handleDelete commits any earlier pending batch, hides the new rows   *)
(*    and starts an 8 second timer. It also starts getToken() into         *)
(*    tokenRef.                                                            *)
(*  - undo clears the timer and shows the rows again.                      *)
(*  - commit sends one DELETE per id. Each request first awaits a token:   *)
(*    getToken() normally, or tokenRef when unloading (keepalive), falling *)
(*    back to getToken() if tokenRef is still null.                        *)
(*  - When the requests settle, deleted rows leave the list, failed ones   *)
(*    come back with an error message.                                     *)
(*  - pagehide (and unmount) flush the pending batch with keepalive.       *)
(*                                                                         *)
(* A request still waiting for its token when the page goes away is never  *)
(* sent: the page's JavaScript stops running.                              *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Rows

VARIABLES
    server,    \* rows the backend holds
    list,      \* scenarios in the page
    hidden,    \* pendingIds
    pending,   \* pending.current.ids ({} when nothing is pending)
    waiting,   \* DELETEs awaiting a token
    sent,      \* DELETEs on the wire (keepalive or not, they reach the server)
    alive,     \* the page is still open
    intent,    \* ghost: rows the person deleted and did not undo
    told       \* ghost: rows whose delete failed with the error shown

vars == <<server, list, hidden, pending, waiting, sent, alive, intent, told>>

Init ==
    /\ server = Rows /\ list = Rows
    /\ hidden = {} /\ pending = {}
    /\ waiting = {} /\ sent = {}
    /\ alive = TRUE /\ intent = {} /\ told = {}

\* commit(): the batch leaves pending and its requests start. With keepalive
\* and tokenRef already set, they skip the token wait.
CommitTo(haveToken) ==
    /\ intent' = intent \cup pending
    /\ IF haveToken THEN /\ sent' = sent \cup pending /\ UNCHANGED waiting
                    ELSE /\ waiting' = waiting \cup pending /\ UNCHANGED sent

Delete(S) ==
    /\ alive /\ S # {} /\ S \subseteq list \ hidden
    /\ CommitTo(FALSE)
    /\ hidden' = hidden \cup S
    /\ pending' = S
    /\ UNCHANGED <<server, list, alive, told>>

Timer ==
    /\ alive /\ pending # {}
    /\ CommitTo(FALSE)
    /\ pending' = {}
    /\ UNCHANGED <<server, list, hidden, alive, told>>

Undo ==
    /\ alive /\ pending # {}
    /\ hidden' = hidden \ pending
    /\ pending' = {}
    /\ UNCHANGED <<server, list, waiting, sent, alive, intent, told>>

TokenArrives(r) ==
    /\ alive /\ r \in waiting
    /\ waiting' = waiting \ {r}
    /\ sent' = sent \cup {r}
    /\ UNCHANGED <<server, list, hidden, pending, alive, intent, told>>

\* The DELETE reaches the server and succeeds. The page updates if open.
Deleted(r) ==
    /\ r \in sent
    /\ sent' = sent \ {r}
    /\ server' = server \ {r}
    /\ IF alive THEN list' = list \ {r} /\ hidden' = hidden \ {r}
                ELSE UNCHANGED <<list, hidden>>
    /\ UNCHANGED <<pending, waiting, alive, intent, told>>

\* The DELETE fails. Only an open page can show the error.
Failed(r) ==
    /\ alive /\ r \in sent
    /\ sent' = sent \ {r}
    /\ hidden' = hidden \ {r}
    /\ told' = told \cup {r}
    /\ intent' = intent \ {r}
    /\ UNCHANGED <<server, list, pending, waiting, alive>>

\* pagehide: flush with keepalive, then the page is gone. Requests still
\* waiting for a token die with it.
PageHide(haveToken) ==
    /\ alive
    /\ CommitTo(haveToken)
    /\ pending' = {}
    /\ alive' = FALSE
    /\ UNCHANGED <<server, list, hidden, told>>

Next ==
    \/ \E S \in SUBSET Rows : Delete(S)
    \/ Timer \/ Undo
    \/ \E r \in Rows : TokenArrives(r) \/ Deleted(r) \/ Failed(r)
    \/ \E b \in BOOLEAN : PageHide(b)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK == hidden \subseteq Rows /\ pending \subseteq hidden \cup Rows

\* Rows waiting out the undo window are hidden.
HiddenWhilePending == alive => pending \subseteq hidden

\* A row the server no longer has is never shown as if it were still there.
DeletedStayGone == alive => \A r \in list \ hidden : r \in server \/ r \in sent

\* Once nothing is pending or in flight, every row the person deleted (and
\* didn't undo, and wasn't told failed) is gone from the server.
ServerMatchesIntent ==
    (pending = {} /\ sent = {} /\ (alive => waiting = {}))
        => intent \cap server = {}
=============================================================================
