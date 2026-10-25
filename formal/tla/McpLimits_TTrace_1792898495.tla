---- MODULE McpLimits_TTrace_1792898495 ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, McpLimits, McpLimits_TEConstants

_expression ==
    LET McpLimits_TEExpression == INSTANCE McpLimits_TEExpression
    IN McpLimits_TEExpression!expression
----

_trace ==
    LET McpLimits_TETrace == INSTANCE McpLimits_TETrace
    IN McpLimits_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        chargedDay = ((r1 :> 0 @@ r2 :> 0 @@ r3 :> 0))
        /\
        cache = ({k1})
        /\
        uncharged = (1)
        /\
        counts = ((a :> 1 @@ b :> 0))
        /\
        limDay = (0)
        /\
        clock = (0)
        /\
        paidNothing = (0)
        /\
        unslotted = (1)
        /\
        caller = ((r1 :> a @@ r2 :> a @@ r3 :> a))
        /\
        crossDay = (0)
        /\
        pc = ((r1 :> "release" @@ r2 :> "release" @@ r3 :> "check"))
        /\
        anonTotal = (1)
        /\
        holds = ({r1})
        /\
        free = (0)
        /\
        runs = ((r1 :> 1 @@ r2 :> 0 @@ r3 :> 0))
        /\
        key = ((r1 :> k1 @@ r2 :> k1 @@ r3 :> k1))
    )
----

_init ==
    /\ runs = _TETrace[1].runs
    /\ counts = _TETrace[1].counts
    /\ key = _TETrace[1].key
    /\ caller = _TETrace[1].caller
    /\ limDay = _TETrace[1].limDay
    /\ cache = _TETrace[1].cache
    /\ pc = _TETrace[1].pc
    /\ uncharged = _TETrace[1].uncharged
    /\ anonTotal = _TETrace[1].anonTotal
    /\ chargedDay = _TETrace[1].chargedDay
    /\ free = _TETrace[1].free
    /\ unslotted = _TETrace[1].unslotted
    /\ holds = _TETrace[1].holds
    /\ clock = _TETrace[1].clock
    /\ crossDay = _TETrace[1].crossDay
    /\ paidNothing = _TETrace[1].paidNothing
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ runs  = _TETrace[i].runs
        /\ runs' = _TETrace[j].runs
        /\ counts  = _TETrace[i].counts
        /\ counts' = _TETrace[j].counts
        /\ key  = _TETrace[i].key
        /\ key' = _TETrace[j].key
        /\ caller  = _TETrace[i].caller
        /\ caller' = _TETrace[j].caller
        /\ limDay  = _TETrace[i].limDay
        /\ limDay' = _TETrace[j].limDay
        /\ cache  = _TETrace[i].cache
        /\ cache' = _TETrace[j].cache
        /\ pc  = _TETrace[i].pc
        /\ pc' = _TETrace[j].pc
        /\ uncharged  = _TETrace[i].uncharged
        /\ uncharged' = _TETrace[j].uncharged
        /\ anonTotal  = _TETrace[i].anonTotal
        /\ anonTotal' = _TETrace[j].anonTotal
        /\ chargedDay  = _TETrace[i].chargedDay
        /\ chargedDay' = _TETrace[j].chargedDay
        /\ free  = _TETrace[i].free
        /\ free' = _TETrace[j].free
        /\ unslotted  = _TETrace[i].unslotted
        /\ unslotted' = _TETrace[j].unslotted
        /\ holds  = _TETrace[i].holds
        /\ holds' = _TETrace[j].holds
        /\ clock  = _TETrace[i].clock
        /\ clock' = _TETrace[j].clock
        /\ crossDay  = _TETrace[i].crossDay
        /\ crossDay' = _TETrace[j].crossDay
        /\ paidNothing  = _TETrace[i].paidNothing
        /\ paidNothing' = _TETrace[j].paidNothing

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("McpLimits_TTrace_1792898495.json", _TETrace)

=============================================================================

 Note that you can extract this module `McpLimits_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `McpLimits_TEExpression.tla` file takes precedence 
  over the module `McpLimits_TEExpression` below).

---- MODULE McpLimits_TEExpression ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, McpLimits, McpLimits_TEConstants

expression == 
    [
        \* To hide variables of the `McpLimits` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        runs |-> runs
        ,counts |-> counts
        ,key |-> key
        ,caller |-> caller
        ,limDay |-> limDay
        ,cache |-> cache
        ,pc |-> pc
        ,uncharged |-> uncharged
        ,anonTotal |-> anonTotal
        ,chargedDay |-> chargedDay
        ,free |-> free
        ,unslotted |-> unslotted
        ,holds |-> holds
        ,clock |-> clock
        ,crossDay |-> crossDay
        ,paidNothing |-> paidNothing
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_runsUnchanged |-> runs = runs'
        
        \* Format the `runs` variable as Json value.
        \* ,_runsJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(runs)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_runsModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].runs # _TETrace[s-1].runs
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE McpLimits_TETrace ----
\*EXTENDS IOUtils, TLC, McpLimits, McpLimits_TEConstants
\*
\*trace == IODeserialize("McpLimits_TTrace_1792898495.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE McpLimits_TETrace ----
EXTENDS TLC, McpLimits, McpLimits_TEConstants

trace == 
    <<
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {},uncharged |-> 0,counts |-> (a :> 0 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 0,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "check" @@ r2 :> "check" @@ r3 :> "check"),anonTotal |-> 0,holds |-> {},free |-> 1,runs |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)]),
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {},uncharged |-> 0,counts |-> (a :> 0 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 0,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "charge" @@ r2 :> "check" @@ r3 :> "check"),anonTotal |-> 0,holds |-> {},free |-> 1,runs |-> (r1 :> 1 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)]),
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {},uncharged |-> 0,counts |-> (a :> 1 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 0,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "acquire" @@ r2 :> "check" @@ r3 :> "check"),anonTotal |-> 1,holds |-> {},free |-> 1,runs |-> (r1 :> 1 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)]),
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {},uncharged |-> 0,counts |-> (a :> 1 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 0,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "compute" @@ r2 :> "check" @@ r3 :> "check"),anonTotal |-> 1,holds |-> {r1},free |-> 0,runs |-> (r1 :> 1 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)]),
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {k1},uncharged |-> 0,counts |-> (a :> 1 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 0,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "release" @@ r2 :> "check" @@ r3 :> "check"),anonTotal |-> 1,holds |-> {r1},free |-> 0,runs |-> (r1 :> 1 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)]),
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {k1},uncharged |-> 0,counts |-> (a :> 1 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 0,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "release" @@ r2 :> "charge" @@ r3 :> "check"),anonTotal |-> 1,holds |-> {r1},free |-> 0,runs |-> (r1 :> 1 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)]),
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {k1},uncharged |-> 0,counts |-> (a :> 1 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 0,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "release" @@ r2 :> "compute" @@ r3 :> "check"),anonTotal |-> 1,holds |-> {r1},free |-> 0,runs |-> (r1 :> 1 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)]),
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {},uncharged |-> 0,counts |-> (a :> 1 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 0,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "release" @@ r2 :> "compute" @@ r3 :> "check"),anonTotal |-> 1,holds |-> {r1},free |-> 0,runs |-> (r1 :> 1 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)]),
    ([chargedDay |-> (r1 :> 0 @@ r2 :> 0 @@ r3 :> 0),cache |-> {k1},uncharged |-> 1,counts |-> (a :> 1 @@ b :> 0),limDay |-> 0,clock |-> 0,paidNothing |-> 0,unslotted |-> 1,caller |-> (r1 :> a @@ r2 :> a @@ r3 :> a),crossDay |-> 0,pc |-> (r1 :> "release" @@ r2 :> "release" @@ r3 :> "check"),anonTotal |-> 1,holds |-> {r1},free |-> 0,runs |-> (r1 :> 1 @@ r2 :> 0 @@ r3 :> 0),key |-> (r1 :> k1 @@ r2 :> k1 @@ r3 :> k1)])
    >>
----


=============================================================================

---- MODULE McpLimits_TEConstants ----
EXTENDS McpLimits

CONSTANTS r1, r2, r3, a, b, k1, k2

=============================================================================

---- CONFIG McpLimits_TTrace_1792898495 ----
CONSTANTS
    Reqs = { r1 , r2 , r3 }
    Callers = { a , b }
    Keys = { k1 , k2 }
    Allow = 2
    AnonCap = 3
    Slots = 1
    MaxDay = 1
    b = b
    k2 = k2
    r1 = r1
    r3 = r3
    a = a
    k1 = k1
    r2 = r2

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
\* Generated on Sun Oct 25 03:21:37 UTC 2026