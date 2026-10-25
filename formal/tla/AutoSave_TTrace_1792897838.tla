---- MODULE AutoSave_TTrace_1792897838 ----
EXTENDS AutoSave_TEConstants, Sequences, TLCExt, Toolbox, AutoSave, Naturals, TLC

_expression ==
    LET AutoSave_TEExpression == INSTANCE AutoSave_TEExpression
    IN AutoSave_TEExpression!expression
----

_trace ==
    LET AutoSave_TETrace == INSTANCE AutoSave_TETrace
    IN AutoSave_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        mem = ((x :> "full" @@ y :> "none"))
        /\
        saved = ((x :> 2 @@ y :> 0))
        /\
        nruns = (2)
        /\
        stored = ((x :> "full" @@ y :> "none"))
        /\
        signedIn = (TRUE)
        /\
        banner = ((x :> "saved" @@ y :> "none"))
        /\
        slimmed = ({})
        /\
        ran = ({x})
        /\
        queue = ({})
        /\
        inflight = ({})
    )
----

_init ==
    /\ slimmed = _TETrace[1].slimmed
    /\ inflight = _TETrace[1].inflight
    /\ mem = _TETrace[1].mem
    /\ stored = _TETrace[1].stored
    /\ banner = _TETrace[1].banner
    /\ signedIn = _TETrace[1].signedIn
    /\ saved = _TETrace[1].saved
    /\ nruns = _TETrace[1].nruns
    /\ ran = _TETrace[1].ran
    /\ queue = _TETrace[1].queue
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ slimmed  = _TETrace[i].slimmed
        /\ slimmed' = _TETrace[j].slimmed
        /\ inflight  = _TETrace[i].inflight
        /\ inflight' = _TETrace[j].inflight
        /\ mem  = _TETrace[i].mem
        /\ mem' = _TETrace[j].mem
        /\ stored  = _TETrace[i].stored
        /\ stored' = _TETrace[j].stored
        /\ banner  = _TETrace[i].banner
        /\ banner' = _TETrace[j].banner
        /\ signedIn  = _TETrace[i].signedIn
        /\ signedIn' = _TETrace[j].signedIn
        /\ saved  = _TETrace[i].saved
        /\ saved' = _TETrace[j].saved
        /\ nruns  = _TETrace[i].nruns
        /\ nruns' = _TETrace[j].nruns
        /\ ran  = _TETrace[i].ran
        /\ ran' = _TETrace[j].ran
        /\ queue  = _TETrace[i].queue
        /\ queue' = _TETrace[j].queue

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("AutoSave_TTrace_1792897838.json", _TETrace)

=============================================================================

 Note that you can extract this module `AutoSave_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `AutoSave_TEExpression.tla` file takes precedence 
  over the module `AutoSave_TEExpression` below).

---- MODULE AutoSave_TEExpression ----
EXTENDS AutoSave_TEConstants, Sequences, TLCExt, Toolbox, AutoSave, Naturals, TLC

expression == 
    [
        \* To hide variables of the `AutoSave` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        slimmed |-> slimmed
        ,inflight |-> inflight
        ,mem |-> mem
        ,stored |-> stored
        ,banner |-> banner
        ,signedIn |-> signedIn
        ,saved |-> saved
        ,nruns |-> nruns
        ,ran |-> ran
        ,queue |-> queue
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_slimmedUnchanged |-> slimmed = slimmed'
        
        \* Format the `slimmed` variable as Json value.
        \* ,_slimmedJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(slimmed)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_slimmedModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].slimmed # _TETrace[s-1].slimmed
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE AutoSave_TETrace ----
\*EXTENDS AutoSave_TEConstants, IOUtils, AutoSave, TLC
\*
\*trace == IODeserialize("AutoSave_TTrace_1792897838.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE AutoSave_TETrace ----
EXTENDS AutoSave_TEConstants, AutoSave, TLC

trace == 
    <<
    ([mem |-> (x :> "none" @@ y :> "none"),saved |-> (x :> 0 @@ y :> 0),nruns |-> 0,stored |-> (x :> "none" @@ y :> "none"),signedIn |-> FALSE,banner |-> (x :> "none" @@ y :> "none"),slimmed |-> {},ran |-> {},queue |-> {},inflight |-> {}]),
    ([mem |-> (x :> "none" @@ y :> "none"),saved |-> (x :> 0 @@ y :> 0),nruns |-> 0,stored |-> (x :> "none" @@ y :> "none"),signedIn |-> TRUE,banner |-> (x :> "none" @@ y :> "none"),slimmed |-> {},ran |-> {},queue |-> {},inflight |-> {}]),
    ([mem |-> (x :> "full" @@ y :> "none"),saved |-> (x :> 0 @@ y :> 0),nruns |-> 1,stored |-> (x :> "full" @@ y :> "none"),signedIn |-> TRUE,banner |-> (x :> "saving" @@ y :> "none"),slimmed |-> {},ran |-> {x},queue |-> {},inflight |-> {x}]),
    ([mem |-> (x :> "full" @@ y :> "none"),saved |-> (x :> 1 @@ y :> 0),nruns |-> 1,stored |-> (x :> "full" @@ y :> "none"),signedIn |-> TRUE,banner |-> (x :> "saved" @@ y :> "none"),slimmed |-> {},ran |-> {x},queue |-> {},inflight |-> {}]),
    ([mem |-> (x :> "full" @@ y :> "none"),saved |-> (x :> 1 @@ y :> 0),nruns |-> 2,stored |-> (x :> "full" @@ y :> "none"),signedIn |-> TRUE,banner |-> (x :> "saving" @@ y :> "none"),slimmed |-> {},ran |-> {x},queue |-> {},inflight |-> {x}]),
    ([mem |-> (x :> "full" @@ y :> "none"),saved |-> (x :> 2 @@ y :> 0),nruns |-> 2,stored |-> (x :> "full" @@ y :> "none"),signedIn |-> TRUE,banner |-> (x :> "saved" @@ y :> "none"),slimmed |-> {},ran |-> {x},queue |-> {},inflight |-> {}])
    >>
----


=============================================================================

---- MODULE AutoSave_TEConstants ----
EXTENDS AutoSave

CONSTANTS x, y

=============================================================================

---- CONFIG AutoSave_TTrace_1792897838 ----
CONSTANTS
    Ids = { x , y }
    MaxRuns = 3
    x = x
    y = y

INVARIANT
    _inv

CHECK_DEADLOCK
    \* CHECK_DEADLOCK off because of PROPERTY or INVARIANT above.
    FALSE

INIT
    _init

NEXT
    _next

CONSTANT
    _TETrace <- _trace

ALIAS
    _expression
=============================================================================
\* Generated on Sun Oct 25 03:10:39 UTC 2026