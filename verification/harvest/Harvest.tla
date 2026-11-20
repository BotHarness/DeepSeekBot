------------------------------ MODULE Harvest ------------------------------
(***************************************************************************)
(* Turn-time harvest of one Bot's ready attention set (ADR-0077).         *)
(*                                                                         *)
(* Code: packages/core/src/runtime/bot-runtime.ts                          *)
(*   Admit      an Inbox Admission commits as `pending`, then              *)
(*              `#checkHarvestReadiness` asks for a harvest.               *)
(*   Schedule   `#scheduleHarvest`: at most one harvest per Bot is queued  *)
(*              or running (`#pendingHarvests`).                           *)
(*   Claim      `#claimHarvest`: pending and retryable Admissions become   *)
(*              `running` in one transaction.                              *)
(*   Cross      `#markAdmissionsSideEffect`: the turn crosses into DSH.    *)
(*   Succeed    `#settleHarvestHandled`: running -> handled.               *)
(*   Fail       `#settleHarvestFailure`: running -> retryable, or          *)
(*              needs-repair once a side effect started.                   *)
(*   Finish     the harvest's `finally`: leave `#pendingHarvests`, then    *)
(*              check readiness again.                                     *)
(*   Restart    `#recoverInterruptedAttempts` and                          *)
(*              `#recoverPendingChannelAdmissions`.                        *)
(*                                                                         *)
(* Each boolean constant is TRUE in the real code. FALSE removes that      *)
(* guard, so the broken configurations show what it buys.                 *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
    Items,                    \* Inbox Admissions for the Bot
    MaxRestarts,
    RecheckAfterTurn,         \* the harvest's finally checks readiness again
    ClaimSkipsNeedsRepair,    \* a claim never takes a needs-repair Admission
    FailureKeepsSideEffects   \* a failed turn after a side effect leaves needs-repair

States == {"none", "pending", "running", "retryable", "needs-repair", "handled"}
Eligible == IF ClaimSkipsNeedsRepair THEN {"pending", "retryable"}
                                     ELSE {"pending", "retryable", "needs-repair"}

VARIABLES
    adm,        \* inbox_admissions.attempt_state per Admission
    effect,     \* side_effect_started_at is set
    exposures,  \* turns that crossed into DSH with the Admission
    harvest,    \* "idle", "queued", "claimed" or "crossed"
    inTurn,     \* the Admissions the current harvest claimed
    restarts

vars == <<adm, effect, exposures, harvest, inTurn, restarts>>

TypeOK ==
    /\ adm \in [Items -> States]
    /\ effect \in [Items -> BOOLEAN]
    /\ exposures \in [Items -> Nat]
    /\ harvest \in {"idle", "queued", "claimed", "crossed"}
    /\ inTurn \subseteq Items

Init ==
    /\ adm = [i \in Items |-> "none"]
    /\ effect = [i \in Items |-> FALSE]
    /\ exposures = [i \in Items |-> 0]
    /\ harvest = "idle"
    /\ inTurn = {}
    /\ restarts = 0

\* `#scheduleHarvest` returns early while a harvest is queued or running.
Scheduled(h) == IF h = "idle" THEN "queued" ELSE h  \* bot-runtime.ts:3854

Admit(i) ==
    /\ adm[i] = "none"
    /\ adm' = [adm EXCEPT ![i] = "pending"]
    /\ harvest' = Scheduled(harvest)  \* bot-runtime.ts:2866, 3882
    /\ UNCHANGED <<effect, exposures, inTurn, restarts>>

\* The model claims every eligible Admission; the per-Channel and turn-wide
\* caps that leave some for a later harvest are not modelled.
Claim ==
    LET ready == {i \in Items : adm[i] \in Eligible} IN  \* bot-runtime.ts:4193, 4218
    /\ harvest = "queued"
    /\ ready # {}
    /\ adm' = [i \in Items |-> IF i \in ready THEN "running" ELSE adm[i]]
    /\ inTurn' = ready
    /\ harvest' = "claimed"
    /\ UNCHANGED <<effect, exposures, restarts>>

\* Nothing to claim: the harvest returns at once (bot-runtime.ts:3990-3998).
Empty ==
    /\ harvest = "queued"
    /\ \A i \in Items : adm[i] \notin Eligible
    /\ harvest' = "idle"
    /\ UNCHANGED <<adm, effect, exposures, inTurn, restarts>>

Cross ==
    /\ harvest = "claimed"
    /\ effect' = [i \in Items |-> effect[i] \/ i \in inTurn]  \* bot-runtime.ts:4530
    /\ exposures' = [i \in Items |-> IF i \in inTurn THEN exposures[i] + 1 ELSE exposures[i]]
    /\ harvest' = "crossed"
    /\ UNCHANGED <<adm, inTurn, restarts>>

\* The harvest's finally: leave `#pendingHarvests`, then check readiness,
\* which looks for pending immediate Admissions (bot-runtime.ts:3857-3860, 3875).
AfterTurn(next) ==
    /\ adm' = next
    /\ inTurn' = {}
    /\ harvest' = IF RecheckAfterTurn /\ \E i \in Items : next[i] = "pending"
                  THEN "queued" ELSE "idle"

Succeed ==
    /\ harvest = "crossed"
    /\ AfterTurn([i \in Items |-> IF i \in inTurn THEN "handled" ELSE adm[i]])  \* bot-runtime.ts:4552
    /\ UNCHANGED <<effect, exposures, restarts>>

Failed(i) ==
    IF effect[i] /\ FailureKeepsSideEffects THEN "needs-repair" ELSE "retryable"  \* bot-runtime.ts:4580

Fail ==
    /\ harvest \in {"claimed", "crossed"}
    /\ AfterTurn([i \in Items |-> IF i \in inTurn THEN Failed(i) ELSE adm[i]])
    /\ UNCHANGED <<effect, exposures, restarts>>

\* Startup marks running Admissions retryable or needs-repair
\* (bot-runtime.ts:8104), then schedules a harvest for any pending or
\* retryable immediate Admission (bot-runtime.ts:3638, 3098).
Restart ==
    LET next == [i \in Items |-> IF adm[i] = "running"
                                  THEN IF effect[i] THEN "needs-repair" ELSE "retryable"
                                  ELSE adm[i]]
    IN
    /\ restarts < MaxRestarts
    /\ adm' = next
    /\ inTurn' = {}
    /\ harvest' = IF \E i \in Items : next[i] \in {"pending", "retryable"} THEN "queued" ELSE "idle"
    /\ restarts' = restarts + 1
    /\ UNCHANGED <<effect, exposures>>

Next ==
    \/ \E i \in Items : Admit(i)
    \/ Claim \/ Empty \/ Cross \/ Succeed \/ Fail
    \/ Restart

Spec ==
    /\ Init /\ [][Next]_vars
    /\ WF_vars(Claim) /\ WF_vars(Empty) /\ WF_vars(Cross) /\ WF_vars(Succeed \/ Fail)

-----------------------------------------------------------------------------
(* The Bot is never woken twice with the same Admission after the first    *)
(* wake reached DSH. Harm if broken: the Bot answers the same message      *)
(* twice and repeats its tool calls.                                       *)
NoReplayAfterSideEffect == \A i \in Items : exposures[i] <= 1

(* An Admission is handled only after a turn actually showed it to the     *)
(* Bot. Harm if broken: a message is marked handled that the Bot never     *)
(* saw.                                                                    *)
HandledOnlyAfterSeen == \A i \in Items : adm[i] = "handled" => exposures[i] >= 1

(* A pending Admission is always claimed by some harvest, even when it     *)
(* arrives while another harvest is running. Harm if broken: a mention     *)
(* waits unanswered until something else wakes the Bot.                   *)
PendingIsHarvested == \A i \in Items : adm[i] = "pending" ~> adm[i] # "pending"
=============================================================================
