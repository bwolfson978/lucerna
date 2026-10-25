---- MODULE AgentSpend_TTrace_1792897756 ----
EXTENDS Sequences, TLCExt, AgentSpend, Toolbox, Naturals, TLC, AgentSpend_TEConstants

_expression ==
    LET AgentSpend_TEExpression == INSTANCE AgentSpend_TEExpression
    IN AgentSpend_TEExpression!expression
----

_trace ==
    LET AgentSpend_TETrace == INSTANCE AgentSpend_TETrace
    IN AgentSpend_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        pc = ((m1 :> "running" @@ m2 :> "running" @@ m3 :> "new"))
        /\
        left = ((m1 :> 0 @@ m2 :> 1 @@ m3 :> 0))
        /\
        ipCounts = ((i1 :> 1 @@ i2 :> 1))
        /\
        spend = (3)
        /\
        from = ((m1 :> c1 @@ m2 :> c1 @@ m3 :> c1))
        /\
        sent = ((c1 :> 2))
    )
----

_init ==
    /\ ipCounts = _TETrace[1].ipCounts
    /\ spend = _TETrace[1].spend
    /\ from = _TETrace[1].from
    /\ left = _TETrace[1].left
    /\ sent = _TETrace[1].sent
    /\ pc = _TETrace[1].pc
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ ipCounts  = _TETrace[i].ipCounts
        /\ ipCounts' = _TETrace[j].ipCounts
        /\ spend  = _TETrace[i].spend
        /\ spend' = _TETrace[j].spend
        /\ from  = _TETrace[i].from
        /\ from' = _TETrace[j].from
        /\ left  = _TETrace[i].left
        /\ left' = _TETrace[j].left
        /\ sent  = _TETrace[i].sent
        /\ sent' = _TETrace[j].sent
        /\ pc  = _TETrace[i].pc
        /\ pc' = _TETrace[j].pc

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("AgentSpend_TTrace_1792897756.json", _TETrace)

=============================================================================

 Note that you can extract this module `AgentSpend_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `AgentSpend_TEExpression.tla` file takes precedence 
  over the module `AgentSpend_TEExpression` below).

---- MODULE AgentSpend_TEExpression ----
EXTENDS Sequences, TLCExt, AgentSpend, Toolbox, Naturals, TLC, AgentSpend_TEConstants

expression == 
    [
        \* To hide variables of the `AgentSpend` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        ipCounts |-> ipCounts
        ,spend |-> spend
        ,from |-> from
        ,left |-> left
        ,sent |-> sent
        ,pc |-> pc
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_ipCountsUnchanged |-> ipCounts = ipCounts'
        
        \* Format the `ipCounts` variable as Json value.
        \* ,_ipCountsJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(ipCounts)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_ipCountsModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].ipCounts # _TETrace[s-1].ipCounts
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE AgentSpend_TETrace ----
\*EXTENDS IOUtils, AgentSpend, TLC, AgentSpend_TEConstants
\*
\*trace == IODeserialize("AgentSpend_TTrace_1792897756.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE AgentSpend_TETrace ----
EXTENDS AgentSpend, TLC, AgentSpend_TEConstants

trace == 
    <<
    ([pc |-> (m1 :> "new" @@ m2 :> "new" @@ m3 :> "new"),left |-> (m1 :> 0 @@ m2 :> 0 @@ m3 :> 0),ipCounts |-> (i1 :> 0 @@ i2 :> 0),spend |-> 0,from |-> (m1 :> c1 @@ m2 :> c1 @@ m3 :> c1),sent |-> (c1 :> 0)]),
    ([pc |-> (m1 :> "running" @@ m2 :> "new" @@ m3 :> "new"),left |-> (m1 :> 2 @@ m2 :> 0 @@ m3 :> 0),ipCounts |-> (i1 :> 1 @@ i2 :> 0),spend |-> 0,from |-> (m1 :> c1 @@ m2 :> c1 @@ m3 :> c1),sent |-> (c1 :> 1)]),
    ([pc |-> (m1 :> "running" @@ m2 :> "running" @@ m3 :> "new"),left |-> (m1 :> 2 @@ m2 :> 2 @@ m3 :> 0),ipCounts |-> (i1 :> 1 @@ i2 :> 1),spend |-> 0,from |-> (m1 :> c1 @@ m2 :> c1 @@ m3 :> c1),sent |-> (c1 :> 2)]),
    ([pc |-> (m1 :> "running" @@ m2 :> "running" @@ m3 :> "new"),left |-> (m1 :> 1 @@ m2 :> 2 @@ m3 :> 0),ipCounts |-> (i1 :> 1 @@ i2 :> 1),spend |-> 1,from |-> (m1 :> c1 @@ m2 :> c1 @@ m3 :> c1),sent |-> (c1 :> 2)]),
    ([pc |-> (m1 :> "running" @@ m2 :> "running" @@ m3 :> "new"),left |-> (m1 :> 0 @@ m2 :> 2 @@ m3 :> 0),ipCounts |-> (i1 :> 1 @@ i2 :> 1),spend |-> 2,from |-> (m1 :> c1 @@ m2 :> c1 @@ m3 :> c1),sent |-> (c1 :> 2)]),
    ([pc |-> (m1 :> "running" @@ m2 :> "running" @@ m3 :> "new"),left |-> (m1 :> 0 @@ m2 :> 1 @@ m3 :> 0),ipCounts |-> (i1 :> 1 @@ i2 :> 1),spend |-> 3,from |-> (m1 :> c1 @@ m2 :> c1 @@ m3 :> c1),sent |-> (c1 :> 2)])
    >>
----


=============================================================================

---- MODULE AgentSpend_TEConstants ----
EXTENDS AgentSpend

CONSTANTS m1, m2, m3, c1, i1, i2

=============================================================================

---- CONFIG AgentSpend_TTrace_1792897756 ----
CONSTANTS
    Msgs = { m1 , m2 , m3 }
    Clients = { c1 }
    Ips = { i1 , i2 }
    PerIp = 1
    Cap = 2
    Cost = 1
    Calls = 2
    c1 = c1
    m1 = m1
    i1 = i1
    m3 = m3
    i2 = i2
    m2 = m2

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
\* Generated on Sun Oct 25 03:09:17 UTC 2026