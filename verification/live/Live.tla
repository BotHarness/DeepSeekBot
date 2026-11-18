------------------------------ MODULE Live ------------------------------
(***************************************************************************)
(* Live Channel delivery follows the durable commit (docs/decisions/      *)
(* messaging.md section 3, ADR-0054).                                      *)
(*                                                                         *)
(* Code: packages/core/src/channels/live.ts and the DSH journal client.   *)
(*   Begin      a placement transaction takes the next Channel revision.   *)
(*   Commit     the transaction commits; the commit waits to be published. *)
(*   Rollback   the transaction rolls back; the revision is free again.    *)
(*   Publish    `publishCommitted` pushes a commit to each subscriber.     *)
(*              Commits publish in any order: a caller may await between   *)
(*              its commit and `onPlaced` (inbound.ts:1046).               *)
(*   Open       `followChannel` reads the head revision and a page through *)
(*              it, then subscribes at that revision, with no await in     *)
(*              between. A reconnect opens again the same way.             *)
(*   Close      the stream ends; frames still on the wire are lost.        *)
(*   Receive    the client's `RemoteJournalStream.acceptEntry`: an entry   *)
(*              at or before its cursor is dropped, the next revision is   *)
(*              appended, and a gap re-reads the page through the entry.   *)
(*                                                                         *)
(* Each boolean constant is TRUE in the real code. FALSE removes that      *)
(* guard, so the broken configurations show what it buys.                 *)
(***************************************************************************)
EXTENDS Naturals, Sequences

CONSTANTS
    MaxMessages,         \* messages written, committed or rolled back
    MaxOpens,            \* opens and reconnects of the client
    PublishAfterCommit,  \* nothing is published inside the transaction
    ServerDedup,         \* the subscriber drops a revision it already delivered
    ClientDropsOld,      \* the client drops an entry at or before its cursor
    ClientRepairsGaps    \* the client re-reads the page when an entry skips revisions

Ids == 1..MaxMessages

VARIABLES
    committed,    \* message id per committed Channel revision
    txn,          \* the message the open transaction writes, or 0
    early,        \* the open transaction's message was already published
    nextId,
    unpublished,  \* committed <<revision, id>> pairs not yet published
    subscribed,   \* the client has an open subscriber
    delivered,    \* that subscriber's `delivered` revision
    wire,         \* entries sent to the client and not yet received
    view,         \* the message ids the client shows, oldest first
    last,         \* the client's cursor
    opens

vars == <<committed, txn, early, nextId, unpublished, subscribed, delivered, wire, view, last, opens>>

Entries == (1..MaxMessages) \X Ids

TypeOK ==
    /\ committed \in Seq(Ids)
    /\ txn \in Ids \cup {0}
    /\ early \in BOOLEAN
    /\ unpublished \subseteq Entries
    /\ subscribed \in BOOLEAN
    /\ delivered \in Nat
    /\ wire \in Seq(Entries)
    /\ view \in Seq(Ids)
    /\ last \in Nat

Init ==
    /\ committed = <<>>
    /\ txn = 0
    /\ early = FALSE
    /\ nextId = 1
    /\ unpublished = {}
    /\ subscribed = FALSE
    /\ delivered = 0
    /\ wire = <<>>
    /\ view = <<>>
    /\ last = 0
    /\ opens = 0

\* `subscriber.push`: live.ts:771 returns early for a revision at or before
\* `delivered`, and live.ts:787 moves `delivered` forward.
Push(e) ==
    IF ~subscribed \/ (ServerDedup /\ e[1] <= delivered)
    THEN UNCHANGED <<wire, delivered>>
    ELSE /\ wire' = Append(wire, e)
         /\ delivered' = e[1]

\* SQLite runs one write transaction at a time.
Begin ==
    /\ txn = 0
    /\ nextId <= MaxMessages
    /\ txn' = nextId
    /\ nextId' = nextId + 1
    /\ early' = FALSE
    /\ UNCHANGED <<committed, unpublished, subscribed, delivered, wire, view, last, opens>>

Commit ==
    /\ txn # 0
    /\ committed' = Append(committed, txn)
    /\ unpublished' = unpublished \cup {<<Len(committed) + 1, txn>>}
    /\ txn' = 0
    /\ UNCHANGED <<early, nextId, subscribed, delivered, wire, view, last, opens>>

Rollback ==
    /\ txn # 0
    /\ txn' = 0
    /\ UNCHANGED <<committed, early, nextId, unpublished, subscribed, delivered, wire, view, last, opens>>

\* `onPlaced` runs after the transaction returns (outbound.ts:715,
\* inbound.ts:1050, 1199, 1551, 3194; plugin.ts:1025, 1084).
Publish ==
    \E e \in unpublished :
        /\ unpublished' = unpublished \ {e}
        /\ Push(e)  \* live.ts:1063
        /\ UNCHANGED <<committed, txn, early, nextId, subscribed, view, last, opens>>

\* Only without the guard: a publish from inside the transaction.
PublishUncommitted ==
    /\ ~PublishAfterCommit
    /\ txn # 0
    /\ ~early
    /\ early' = TRUE
    /\ Push(<<Len(committed) + 1, txn>>)
    /\ UNCHANGED <<committed, txn, nextId, unpublished, subscribed, view, last, opens>>

\* `followChannel` (live.ts:914-929): head, page and subscribe in one step.
\* The replay of `messagesAfter(head)` (live.ts:876) is empty.
Open ==
    /\ ~subscribed
    /\ opens < MaxOpens
    /\ view' = committed
    /\ last' = Len(committed)
    /\ subscribed' = TRUE
    /\ delivered' = Len(committed)  \* live.ts:755
    /\ wire' = <<>>
    /\ opens' = opens + 1
    /\ UNCHANGED <<committed, txn, early, nextId, unpublished>>

Close ==
    /\ subscribed
    /\ subscribed' = FALSE
    /\ wire' = <<>>
    /\ UNCHANGED <<committed, txn, early, nextId, unpublished, delivered, view, last, opens>>

\* `acceptEntry` in @deepseek-ai/dsh-api-gateway journal-stream.js, with
\* `follows: right === left + 1` from live-snapshots.ts. A repair reads the
\* committed page through the entry's revision, which must exist.
Receive ==
    LET e == Head(wire)
        r == e[1]
    IN
    /\ wire # <<>>
    /\ wire' = Tail(wire)
    /\ \/ /\ ClientDropsOld /\ r <= last
          /\ UNCHANGED <<view, last>>
       \/ /\ ~(ClientDropsOld /\ r <= last)
          /\ ClientRepairsGaps /\ r > last + 1
          /\ r <= Len(committed)
          /\ view' = SubSeq(committed, 1, r)
          /\ last' = r
       \/ /\ ~(ClientDropsOld /\ r <= last)
          /\ ~(ClientRepairsGaps /\ r > last + 1)
          /\ view' = Append(view, e[2])
          /\ last' = r
    /\ UNCHANGED <<committed, txn, early, nextId, unpublished, subscribed, delivered, opens>>

Next ==
    \/ Begin \/ Commit \/ Rollback
    \/ Publish \/ PublishUncommitted
    \/ Open \/ Close \/ Receive

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* The client never shows the same message twice. Harm if broken: a        *)
(* message appears twice in the timeline.                                  *)
NoDuplicate ==
    \A j, k \in 1..Len(view) : j # k => view[j] # view[k]

(* The client shows only messages that committed. Harm if broken: a client *)
(* acts on a message that never existed.                                   *)
OnlyCommitted ==
    \A k \in 1..Len(view) : \E j \in 1..Len(committed) : committed[j] = view[k]

(* The client shows the Channel's committed messages in revision order,    *)
(* from the start, with none skipped. Harm if broken: a message is         *)
(* missing or out of place until the page is reloaded.                     *)
NoGap ==
    /\ Len(view) <= Len(committed)
    /\ \A k \in 1..Len(view) : view[k] = committed[k]
=============================================================================
