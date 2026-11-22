---------------------------- MODULE Enrollment ----------------------------
(***************************************************************************)
(* Relationship enrollment keeps issuance and cancellation durable        *)
(* (ADR-0339).                                                             *)
(*                                                                         *)
(* One Host Relationship. The source Host enrolls Client keys on the      *)
(* target Host; each key has one fixed deadline that both Hosts record.    *)
(*                                                                         *)
(* Code: packages/core/src/devices/                                        *)
(*   BeginOutgoing  source `beginOutgoing`: an unconfirmed intent.         *)
(*   Offer          target `enrollment` -> `beginIncoming` and a live      *)
(*                  pairing offer. The request may arrive late.            *)
(*   Redeem         target `pairing.redeem`: one transaction checks the    *)
(*                  intent and commits the device and its grant.           *)
(*   Reply          the redemption reply reaches the Client, or is lost.   *)
(*   Confirm        source `commit`, after the Client stored its key.      *)
(*   Tick           the key's deadline passes, then its retention.         *)
(*   DueCleanup     source `dueCleanup`: an expired unconfirmed intent     *)
(*                  waits for cleanup.                                     *)
(*   QueueCleanup   source `queueCleanup`: an explicit cancel or a failed  *)
(*                  confirmation.                                          *)
(*   Cleanup        `cleanupEnrollment`: the target's `cancelIncoming`,    *)
(*                  then the source's `acknowledgeCleanup`.                *)
(*   Reclaim        target rows deleted after deadline plus sixty seconds. *)
(*   Restart        the target's live offers are lost.                     *)
(*                                                                         *)
(* Each boolean constant is TRUE in the real code. FALSE removes that      *)
(* guard, so the broken configurations show what it buys.                 *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
    Keys,                   \* Client public keys
    MaxOffers,              \* live offers per key at once
    MaxRestarts,
    RedeemChecksState,      \* redemption needs an unconfirmed intent
    RedeemChecksDeadline,   \* redemption needs the intent's deadline ahead
    CancelWritesTombstone,  \* cancellation records an intent it has not seen
    CancelRevokesGrants,    \* cancellation revokes the key's devices in its transaction
    CleanupOnExpiry         \* an expired unconfirmed intent enters cleanup

VARIABLES
    out,        \* source relationship_client_enrollments.state ('outgoing')
    in,         \* target relationship_client_enrollments.state ('incoming')
    phase,      \* "open", "expired" (deadline passed), "reclaimable" (plus 60 s)
    offers,     \* live pairing offers for the key on the target
    active,     \* unrevoked relationship device grants for the key
    issued,     \* grants ever issued for the key
    reply,      \* "none", "sent", "received" or "lost"
    cancelled,  \* the target ran a cancellation for the key
    late,       \* a grant was issued after the key's deadline
    restarts

vars == <<out, in, phase, offers, active, issued, reply, cancelled, late, restarts>>

OutStates == {"none", "unconfirmed", "committed", "cleanup-pending", "cleaned"}
InStates == {"none", "unconfirmed", "committed", "cancelled"}

TypeOK ==
    /\ out \in [Keys -> OutStates]
    /\ in \in [Keys -> InStates]
    /\ phase \in [Keys -> {"open", "expired", "reclaimable"}]
    /\ offers \in [Keys -> 0..MaxOffers]
    /\ active \in [Keys -> Nat]
    /\ issued \in [Keys -> Nat]
    /\ reply \in [Keys -> {"none", "sent", "received", "lost"}]
    /\ cancelled \in [Keys -> BOOLEAN]
    /\ late \in [Keys -> BOOLEAN]

Init ==
    /\ out = [k \in Keys |-> "none"]
    /\ in = [k \in Keys |-> "none"]
    /\ phase = [k \in Keys |-> "open"]
    /\ offers = [k \in Keys |-> 0]
    /\ active = [k \in Keys |-> 0]
    /\ issued = [k \in Keys |-> 0]
    /\ reply = [k \in Keys |-> "none"]
    /\ cancelled = [k \in Keys |-> FALSE]
    /\ late = [k \in Keys |-> FALSE]
    /\ restarts = 0

BeginOutgoing(k) ==
    /\ out[k] = "none"
    /\ out' = [out EXCEPT ![k] = "unconfirmed"]  \* relationship-enrollments.ts:165
    /\ UNCHANGED <<in, phase, offers, active, issued, reply, cancelled, late, restarts>>

\* The offer request can arrive at any time after the source asked.
Offer(k) ==
    /\ out[k] # "none"
    /\ phase[k] = "open"  \* relationship-enrollments.ts:177-182
    /\ in[k] \in {"none", "unconfirmed"}  \* relationship-enrollments.ts:185
    /\ offers[k] < MaxOffers
    /\ in' = [in EXCEPT ![k] = "unconfirmed"]
    /\ offers' = [offers EXCEPT ![k] = @ + 1]  \* relationships.ts:368
    /\ UNCHANGED <<out, phase, active, issued, reply, cancelled, late, restarts>>

\* pairing.ts:462 consumes the offer; pairing.ts:507-555 is one transaction.
Redeem(k) ==
    LET ok == /\ RedeemChecksState => in[k] = "unconfirmed"  \* pairing.ts:526
              /\ RedeemChecksDeadline => phase[k] = "open"  \* pairing.ts:526
    IN
    /\ offers[k] > 0
    /\ offers' = [offers EXCEPT ![k] = @ - 1]
    /\ IF ok
       THEN /\ in' = [in EXCEPT ![k] = "committed"]  \* pairing.ts:530
            /\ active' = [active EXCEPT ![k] = @ + 1]
            /\ issued' = [issued EXCEPT ![k] = @ + 1]
            /\ reply' = [reply EXCEPT ![k] = "sent"]
            /\ late' = [late EXCEPT ![k] = @ \/ phase[k] # "open"]
       ELSE UNCHANGED <<in, active, issued, reply, late>>
    /\ UNCHANGED <<out, phase, cancelled, restarts>>

Receive(k) ==
    /\ reply[k] = "sent"
    /\ reply' = [reply EXCEPT ![k] = "received"]
    /\ UNCHANGED <<out, in, phase, offers, active, issued, cancelled, late, restarts>>

Lose(k) ==
    /\ reply[k] = "sent"
    /\ reply' = [reply EXCEPT ![k] = "lost"]
    /\ UNCHANGED <<out, in, phase, offers, active, issued, cancelled, late, restarts>>

\* relationship-enrollments.ts:195 refuses an expired unconfirmed intent.
Confirm(k) ==
    /\ reply[k] = "received"
    /\ out[k] = "unconfirmed"
    /\ phase[k] = "open"
    /\ out' = [out EXCEPT ![k] = "committed"]
    /\ UNCHANGED <<in, phase, offers, active, issued, reply, cancelled, late, restarts>>

Tick(k) ==
    /\ out[k] # "none"
    /\ phase[k] # "reclaimable"
    /\ phase' = [phase EXCEPT ![k] = IF @ = "open" THEN "expired" ELSE "reclaimable"]
    /\ UNCHANGED <<out, in, offers, active, issued, reply, cancelled, late, restarts>>

\* relationship-enrollments.ts:254-266
DueCleanup(k) ==
    /\ CleanupOnExpiry
    /\ out[k] = "unconfirmed"
    /\ phase[k] # "open"
    /\ out' = [out EXCEPT ![k] = "cleanup-pending"]
    /\ UNCHANGED <<in, phase, offers, active, issued, reply, cancelled, late, restarts>>

\* relationship-control.ts:519, 840; relationship-enrollments.ts:207-221
QueueCleanup(k) ==
    /\ out[k] \notin {"none", "cleaned", "cleanup-pending"}
    /\ out' = [out EXCEPT ![k] = "cleanup-pending"]
    /\ UNCHANGED <<in, phase, offers, active, issued, reply, cancelled, late, restarts>>

\* `cancelIncoming` (relationship-enrollments.ts:223-252): one transaction
\* writes the tombstone and revokes the key's devices, then live offers go.
CancelIncoming(k) ==
    /\ in' = [in EXCEPT ![k] =
                 IF @ = "none"
                 THEN IF CancelWritesTombstone /\ phase[k] = "open"
                      THEN "cancelled" ELSE "none"  \* relationship-enrollments.ts:233
                 ELSE "cancelled"]  \* relationship-enrollments.ts:236
    /\ active' = [active EXCEPT ![k] = IF CancelRevokesGrants THEN 0 ELSE @]  \* :243-245
    /\ offers' = [offers EXCEPT ![k] = 0]  \* :250, pairing.ts:428
    /\ cancelled' = [cancelled EXCEPT ![k] = TRUE]

\* relationship-control.ts:408-455; acknowledgeCleanup follows the peer's reply.
Cleanup(k) ==
    /\ out[k] = "cleanup-pending"
    /\ CancelIncoming(k)
    /\ out' = [out EXCEPT ![k] = "cleaned"]
    /\ UNCHANGED <<phase, issued, reply, late, restarts>>

\* relationship-enrollments.ts:84-97
Reclaim(k) ==
    /\ phase[k] = "reclaimable"
    /\ \/ in[k] \in {"unconfirmed", "cancelled"}
       \/ in[k] = "committed" /\ active[k] = 0
    /\ in' = [in EXCEPT ![k] = "none"]
    /\ UNCHANGED <<out, phase, offers, active, issued, reply, cancelled, late, restarts>>

Restart ==
    /\ restarts < MaxRestarts
    /\ offers' = [k \in Keys |-> 0]
    /\ restarts' = restarts + 1
    /\ UNCHANGED <<out, in, phase, active, issued, reply, cancelled, late>>

Next ==
    \/ \E k \in Keys :
        \/ BeginOutgoing(k) \/ Offer(k) \/ Redeem(k) \/ Receive(k) \/ Lose(k)
        \/ Confirm(k) \/ Tick(k) \/ DueCleanup(k) \/ QueueCleanup(k)
        \/ Cleanup(k) \/ Reclaim(k)
    \/ Restart

Spec ==
    /\ Init /\ [][Next]_vars
    /\ \A k \in Keys : WF_vars(Tick(k)) /\ WF_vars(DueCleanup(k)) /\ WF_vars(Cleanup(k))

-----------------------------------------------------------------------------
(* One Client key gets at most one device grant. Harm if broken: a key     *)
(* holds two grants, and revoking the one the Client knows leaves the      *)
(* other active.                                                           *)
OneGrantPerKey == \A k \in Keys : issued[k] <= 1

(* After a cancellation for a key, the key has no active grant, whether    *)
(* the cancellation came before the offer, before redemption or after it.  *)
(* Harm if broken: a cancelled Client keeps access to the Host.            *)
NoGrantAfterCancel == \A k \in Keys : cancelled[k] => active[k] = 0

(* No grant is issued after the key's deadline. Harm if broken: an intent  *)
(* the source already gave up on gains a device that nobody will confirm.  *)
NoGrantAfterDeadline == \A k \in Keys : ~late[k]

(* A grant whose reply never reached the Client is eventually revoked.     *)
(* Harm if broken: an unknown device grant stays active on the Host.       *)
LostGrantRevoked ==
    \A k \in Keys : (active[k] > 0 /\ reply[k] = "lost") ~> active[k] = 0
=============================================================================
