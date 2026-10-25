----------------------------- MODULE AutoSave -----------------------------
(***************************************************************************)
(* Saving runs to "My scenarios", including runs made before signing in:   *)
(* frontend/src/components/conversation/ScenarioWorkspace.tsx (saveResult *)
(* and the "Once signed in, save the runs made before" effect) with        *)
(* frontend/src/lib/agent/conversation.ts (saveConversation).              *)
(*                                                                         *)
(*  - A signed-out run's id replaces the session list keys.unsaved: only  *)
(*    the scenario's latest run is kept.                                   *)
(*  - A scenario keeps one saved row: the first save creates it (keys.saved*)
(*    gets its id), later saves overwrite it. Saves run one at a time.     *)
(*    Start over / New scenario forget keys.saved.                         *)
(*  - A signed-in run is POSTed at once; its banner shows saving, then     *)
(*    saved, or goes back to "prompt" if the request fails. While signed   *)
(*    in, the banner is only shown for "saving" and "saved".               *)
(*  - saveConversation writes results to sessionStorage; when that is over *)
(*    quota it writes them again with result: null ("slim").              *)
(*  - Google sign-in reloads the page; the conversation, results included, *)
(*    comes back from sessionStorage.                                      *)
(*  - Once signed in, the effect walks keys.unsaved: an id with no restored*)
(*    result yet waits; one with a result is saved; one whose result is    *)
(*    null is dropped from the list without saving.                        *)
(*                                                                         *)
(* Result ids are r_<hash of the scenario> for assistant runs, so running  *)
(* the same scenario again gives the same id.                              *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Ids, MaxRuns

VARIABLES
    signedIn,
    mem,       \* state.results in the page: "none" | "full" | "slim"
    stored,    \* the sessionStorage copy of the same
    queue,     \* keys.unsaved
    inflight,  \* save requests in flight
    banner,    \* saveStates[id]: "none" | "saving" | "saved" | "prompt"
    saved,     \* saves of each run that reached the server
    savedId,   \* keys.saved is set: this tab's scenario has a row
    rows,      \* rows on the server for this tab's scenario since its start
    latest,    \* ghost: the scenario's latest run ("none" after a start)
    ran,       \* ghost: ids the person ran
    slimmed,   \* ghost: ids whose stored result was ever slimmed
    nruns      \* ghost: bound on runs for the model checker

vars == <<signedIn, mem, stored, queue, inflight, banner, saved, savedId, rows, latest,
          ran, slimmed, nruns>>

States == {"none", "full", "slim"}

Init ==
    /\ signedIn = FALSE
    /\ mem = [i \in Ids |-> "none"]
    /\ stored = [i \in Ids |-> "none"]
    /\ queue = {} /\ inflight = {}
    /\ banner = [i \in Ids |-> "none"]
    /\ saved = [i \in Ids |-> 0]
    /\ savedId = FALSE /\ rows = 0 /\ latest = "none"
    /\ ran = {} /\ slimmed = {} /\ nruns = 0

\* A run finishes; addResult then saveConversation (assume it fits for now).
Run(i) ==
    /\ nruns < MaxRuns
    /\ nruns' = nruns + 1
    /\ ran' = ran \cup {i}
    /\ mem' = [mem EXCEPT ![i] = "full"]
    /\ stored' = [stored EXCEPT ![i] = "full"]
    /\ IF signedIn
          THEN /\ inflight' = inflight \cup {i}
               /\ banner' = [banner EXCEPT ![i] = "saving"]
               /\ UNCHANGED queue
          ELSE /\ queue' = {i}                    \* writeSession(keys.unsaved, [id])
               /\ UNCHANGED <<inflight, banner>>
    /\ latest' = i
    /\ UNCHANGED <<signedIn, saved, savedId, rows, slimmed>>

\* saveConversation hits the quota: results are stored with result: null.
StorageFull ==
    /\ \E i \in Ids : stored[i] = "full"
    /\ stored' = [i \in Ids |-> IF stored[i] = "full" THEN "slim" ELSE stored[i]]
    /\ slimmed' = slimmed \cup {i \in Ids : stored[i] = "full"}
    /\ UNCHANGED <<signedIn, mem, queue, inflight, banner, saved, savedId, rows, latest,
                   ran, nruns>>

\* Sign in from a modal: no reload.
SignInModal ==
    /\ ~signedIn
    /\ signedIn' = TRUE
    /\ UNCHANGED <<mem, stored, queue, inflight, banner, saved, savedId, rows, latest,
                   ran, slimmed, nruns>>

\* Google sign-in: a full reload. The page restores state.results from storage.
SignInReload ==
    /\ ~signedIn /\ inflight = {}
    /\ signedIn' = TRUE
    /\ mem' = stored
    /\ banner' = [i \in Ids |-> "none"]
    /\ UNCHANGED <<stored, queue, inflight, saved, savedId, rows, latest, ran, slimmed, nruns>>

\* The effect: save what is restored, keep what isn't, drop result: null.
SaveQueued ==
    /\ signedIn /\ queue # {}
    /\ LET send == {i \in queue : mem[i] = "full"}
           wait == {i \in queue : mem[i] = "none"}
       IN  /\ queue' = wait
           /\ inflight' = inflight \cup send
           /\ banner' = [i \in Ids |-> IF i \in send THEN "saving" ELSE banner[i]]
    /\ UNCHANGED <<signedIn, mem, stored, saved, savedId, rows, latest, ran, slimmed, nruns>>

SaveOk(i) ==
    /\ i \in inflight
    /\ inflight' = inflight \ {i}
    /\ saved' = [saved EXCEPT ![i] = @ + 1]
    /\ banner' = [banner EXCEPT ![i] = "saved"]
    \* The queued save reads keys.saved when its turn comes: PUT if set, else POST.
    /\ rows' = IF savedId THEN rows ELSE rows + 1
    /\ savedId' = TRUE
    /\ UNCHANGED <<signedIn, mem, stored, queue, latest, ran, slimmed, nruns>>

SaveFails(i) ==
    /\ i \in inflight
    /\ inflight' = inflight \ {i}
    /\ banner' = [banner EXCEPT ![i] = "prompt"]
    /\ UNCHANGED <<signedIn, mem, stored, queue, saved, savedId, rows, latest, ran, slimmed,
                   nruns>>

\* Start over, or New scenario: forget keys.saved and keys.unsaved.
StartNew ==
    /\ inflight = {}
    /\ savedId' = FALSE /\ rows' = 0 /\ queue' = {} /\ latest' = "none"
    /\ UNCHANGED <<signedIn, mem, stored, inflight, banner, saved, ran, slimmed, nruns>>

Next ==
    \/ \E i \in Ids : Run(i) \/ SaveOk(i) \/ SaveFails(i)
    \/ StorageFull \/ SignInModal \/ SignInReload \/ SaveQueued \/ StartNew

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
TypeOK ==
    /\ mem \in [Ids -> States] /\ stored \in [Ids -> States]
    /\ queue \subseteq Ids /\ inflight \subseteq Ids

\* The banner the person can see for a run (ScenarioWorkspace showBanner).
Shown(i) == ~signedIn \/ banner[i] \in {"saving", "saved"}

\* The scenario's latest run is saved, on its way to being saved, or the person
\* can see that it is not ("Save your analysis" with a button).
NoSilentLoss ==
    \A i \in {latest} \ {"none"} :
        \/ saved[i] > 0
        \/ i \in queue \cup inflight
        \/ (banner[i] = "prompt" /\ Shown(i))

\* The same, for runs whose stored result was never slimmed: isolates the
\* failed-request path from the storage path.
NoSilentLossWhenStorageFits ==
    \A i \in ({latest} \ {"none"}) \ slimmed :
        \/ saved[i] > 0
        \/ i \in queue \cup inflight
        \/ (banner[i] = "prompt" /\ Shown(i))

\* The same, for runs whose save request never failed: isolates the storage
\* path from the failed-request path.
NoSilentLossWhenSavesSucceed ==
    \A i \in {latest} \ {"none"} :
        banner[i] # "prompt" => (saved[i] > 0 \/ i \in queue \cup inflight)

\* One row in "My scenarios" per scenario, however often it is run (Barry's rule:
\* only an explicit start makes a new one).
NoDuplicateSaves == rows <= 1
=============================================================================
