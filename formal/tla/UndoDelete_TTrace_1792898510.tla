---- MODULE UndoDelete_TTrace_1792898510 ----
EXTENDS UndoDelete, Sequences, TLCExt, Toolbox, Naturals, TLC, UndoDelete_TEConstants

_expression ==
    LET UndoDelete_TEExpression == INSTANCE UndoDelete_TEExpression
    IN UndoDelete_TEExpression!expression
----

_trace ==
    LET UndoDelete_TETrace == INSTANCE UndoDelete_TETrace
    IN UndoDelete_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        server = ({s1, s2, s3})
        /\
        hidden = ({s1})
        /\
        alive = (FALSE)
        /\
        waiting = ({s1})
        /\
        told = ({})
        /\
        pending = ({})
        /\
        list = ({s1, s2, s3})
        /\
        sent = ({})
        /\
        intent = ({s1})
    )
----

_init ==
    /\ pending = _TETrace[1].pending
    /\ hidden = _TETrace[1].hidden
    /\ alive = _TETrace[1].alive
    /\ told = _TETrace[1].told
    /\ waiting = _TETrace[1].waiting
    /\ sent = _TETrace[1].sent
    /\ list = _TETrace[1].list
    /\ server = _TETrace[1].server
    /\ intent = _TETrace[1].intent
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ pending  = _TETrace[i].pending
        /\ pending' = _TETrace[j].pending
        /\ hidden  = _TETrace[i].hidden
        /\ hidden' = _TETrace[j].hidden
        /\ alive  = _TETrace[i].alive
        /\ alive' = _TETrace[j].alive
        /\ told  = _TETrace[i].told
        /\ told' = _TETrace[j].told
        /\ waiting  = _TETrace[i].waiting
        /\ waiting' = _TETrace[j].waiting
        /\ sent  = _TETrace[i].sent
        /\ sent' = _TETrace[j].sent
        /\ list  = _TETrace[i].list
        /\ list' = _TETrace[j].list
        /\ server  = _TETrace[i].server
        /\ server' = _TETrace[j].server
        /\ intent  = _TETrace[i].intent
        /\ intent' = _TETrace[j].intent

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("UndoDelete_TTrace_1792898510.json", _TETrace)

=============================================================================

 Note that you can extract this module `UndoDelete_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `UndoDelete_TEExpression.tla` file takes precedence 
  over the module `UndoDelete_TEExpression` below).

---- MODULE UndoDelete_TEExpression ----
EXTENDS UndoDelete, Sequences, TLCExt, Toolbox, Naturals, TLC, UndoDelete_TEConstants

expression == 
    [
        \* To hide variables of the `UndoDelete` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        pending |-> pending
        ,hidden |-> hidden
        ,alive |-> alive
        ,told |-> told
        ,waiting |-> waiting
        ,sent |-> sent
        ,list |-> list
        ,server |-> server
        ,intent |-> intent
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_pendingUnchanged |-> pending = pending'
        
        \* Format the `pending` variable as Json value.
        \* ,_pendingJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(pending)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_pendingModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].pending # _TETrace[s-1].pending
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE UndoDelete_TETrace ----
\*EXTENDS UndoDelete, IOUtils, TLC, UndoDelete_TEConstants
\*
\*trace == IODeserialize("UndoDelete_TTrace_1792898510.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE UndoDelete_TETrace ----
EXTENDS UndoDelete, TLC, UndoDelete_TEConstants

trace == 
    <<
    ([server |-> {s1, s2, s3},hidden |-> {},alive |-> TRUE,waiting |-> {},told |-> {},pending |-> {},list |-> {s1, s2, s3},sent |-> {},intent |-> {}]),
    ([server |-> {s1, s2, s3},hidden |-> {s1},alive |-> TRUE,waiting |-> {},told |-> {},pending |-> {s1},list |-> {s1, s2, s3},sent |-> {},intent |-> {}]),
    ([server |-> {s1, s2, s3},hidden |-> {s1},alive |-> FALSE,waiting |-> {s1},told |-> {},pending |-> {},list |-> {s1, s2, s3},sent |-> {},intent |-> {s1}])
    >>
----


=============================================================================

---- MODULE UndoDelete_TEConstants ----
EXTENDS UndoDelete

CONSTANTS s1, s2, s3

=============================================================================

---- CONFIG UndoDelete_TTrace_1792898510 ----
CONSTANTS
    Rows = { s1 , s2 , s3 }
    s2 = s2
    s1 = s1
    s3 = s3

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
\* Generated on Sun Oct 25 03:21:50 UTC 2026