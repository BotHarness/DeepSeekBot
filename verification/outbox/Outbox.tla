------------------------------ MODULE Outbox ------------------------------
(***************************************************************************)
(* The external Outbox (docs/decisions/im-providers.md, ADR-0039).        *)
(*                                                                         *)
(* Code: packages/core/src/messaging/outbound.ts                           *)
(*   Begin      `send()` inserts the intent for a request key, or returns  *)
(*              the existing one (`if (!id.created) ... return value`).    *)
(*   Claim      one transaction: `if (intent.state !== 'pending') throw`,  *)
(*              set `in-flight`, insert the `messaging_outbox_attempts`    *)
(*              row (primary key `intent_id`).                             *)
(*   Post       the provider call, after the claim has committed.          *)
(*   Settle     `settle()`: only a pending or in-flight intent changes.    *)
(*   Revoke     `revokePendingIntents()`: pending -> grant-revoked.        *)
(*   Restart    recovery at `createOutboundMessaging()`:                   *)
(*              in-flight -> unknown-outcome, pending -> cancelled.        *)
(*                                                                         *)
(* Each boolean constant is TRUE in the real code. Setting it FALSE        *)
(* removes that guard, so the broken configurations show what it buys.    *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
    Keys,                      \* request keys
    Procs,                     \* concurrent `send()` calls
    MaxRestarts,               \* Host crashes and restarts explored
    ReturnExisting,            \* a repeated key returns the existing intent
    ClaimRequiresPending,      \* the claim refuses an intent that is not pending
    OneAttemptPerIntent,       \* attempts.intent_id is a primary key
    ClaimBeforePost,           \* the in-flight claim commits before the provider call
    RecoverInFlightAsUnknown   \* recovery never puts a started attempt back to pending

NoKey == "none"
Unsent == {"none", "pending", "cancelled", "grant-revoked"}
States == Unsent \cup {"in-flight", "provider-accepted", "provider-rejected", "unknown-outcome"}

VARIABLES
    state,      \* intent state per key, as stored in messaging_outbox.state
    attempted,  \* an attempts row exists for the key
    sends,      \* provider calls made for the key
    holds,      \* the key a `send()` call is dispatching, or NoKey
    claimed,    \* that call's claim committed
    posted,     \* that call reached the provider
    restarts

vars == <<state, attempted, sends, holds, claimed, posted, restarts>>

TypeOK ==
    /\ state \in [Keys -> States]
    /\ attempted \in [Keys -> BOOLEAN]
    /\ sends \in [Keys -> Nat]
    /\ holds \in [Procs -> Keys \cup {NoKey}]
    /\ claimed \in [Procs -> BOOLEAN]
    /\ posted \in [Procs -> BOOLEAN]

Init ==
    /\ state = [k \in Keys |-> "none"]
    /\ attempted = [k \in Keys |-> FALSE]
    /\ sends = [k \in Keys |-> 0]
    /\ holds = [p \in Procs |-> NoKey]
    /\ claimed = [p \in Procs |-> FALSE]
    /\ posted = [p \in Procs |-> FALSE]
    /\ restarts = 0

Release(p) ==
    /\ holds' = [holds EXCEPT ![p] = NoKey]
    /\ claimed' = [claimed EXCEPT ![p] = FALSE]
    /\ posted' = [posted EXCEPT ![p] = FALSE]

\* A new key inserts a pending intent. A repeated key only dispatches when
\* the guard that returns the existing intent is removed.
Begin(p, k) ==
    /\ holds[p] = NoKey
    /\ \/ /\ state[k] = "none"
          /\ state' = [state EXCEPT ![k] = "pending"]  \* outbound.ts:3193
       \/ /\ state[k] # "none"
          /\ ~ReturnExisting  \* outbound.ts:3207
          /\ UNCHANGED state
    /\ holds' = [holds EXCEPT ![p] = k]
    /\ UNCHANGED <<attempted, sends, claimed, posted, restarts>>

Claim(p) ==
    LET k == holds[p] IN
    /\ k # NoKey
    /\ ~claimed[p]
    /\ ClaimRequiresPending => state[k] = "pending"  \* outbound.ts:3246
    /\ OneAttemptPerIntent => ~attempted[k]  \* outbound.ts:3255, schema-plan.ts:1107
    /\ state' = [state EXCEPT ![k] = "in-flight"]
    /\ attempted' = [attempted EXCEPT ![k] = TRUE]
    /\ claimed' = [claimed EXCEPT ![p] = TRUE]
    /\ UNCHANGED <<sends, holds, posted, restarts>>

\* The claim transaction throws, so `send()` returns without a provider call.
ClaimRefused(p) ==
    LET k == holds[p] IN
    /\ k # NoKey
    /\ ~claimed[p]
    /\ ~posted[p]
    /\ \/ ClaimRequiresPending /\ state[k] # "pending"
       \/ OneAttemptPerIntent /\ attempted[k]
    /\ Release(p)
    /\ UNCHANGED <<state, attempted, sends, restarts>>

Post(p) ==
    LET k == holds[p] IN
    /\ k # NoKey
    /\ ~posted[p]
    /\ claimed[p] \/ ~ClaimBeforePost  \* outbound.ts:3315 runs after the claim at 3237
    /\ sends' = [sends EXCEPT ![k] = @ + 1]
    /\ posted' = [posted EXCEPT ![p] = TRUE]
    /\ UNCHANGED <<state, attempted, holds, claimed, restarts>>

\* A provider result, a pre-post fence refusal, a timeout or a thrown send.
Settle(p) ==
    LET k == holds[p] IN
    /\ k # NoKey
    /\ claimed[p]
    /\ \E result \in IF posted[p]
                     THEN {"provider-accepted", "provider-rejected", "unknown-outcome"}
                     ELSE {"provider-rejected", "unknown-outcome"} :
           state' = [state EXCEPT ![k] =
                        IF @ \in {"pending", "in-flight"} THEN result ELSE @]  \* outbound.ts:944
    /\ Release(p)
    /\ UNCHANGED <<attempted, sends, restarts>>

Revoke(k) ==
    /\ state[k] = "pending"  \* outbound.ts:507
    /\ state' = [state EXCEPT ![k] = "grant-revoked"]
    /\ UNCHANGED <<attempted, sends, holds, claimed, posted, restarts>>

Recovered(s) ==
    \* outbound.ts:967-984
    CASE s = "in-flight" -> IF RecoverInFlightAsUnknown THEN "unknown-outcome" ELSE "pending"
      [] s = "pending" -> "cancelled"
      [] OTHER -> s

Restart ==
    /\ restarts < MaxRestarts
    /\ state' = [k \in Keys |-> Recovered(state[k])]
    /\ holds' = [p \in Procs |-> NoKey]
    /\ claimed' = [p \in Procs |-> FALSE]
    /\ posted' = [p \in Procs |-> FALSE]
    /\ restarts' = restarts + 1
    /\ UNCHANGED <<attempted, sends>>

Next ==
    \/ \E p \in Procs, k \in Keys : Begin(p, k)
    \/ \E p \in Procs : Claim(p) \/ ClaimRefused(p) \/ Post(p) \/ Settle(p)
    \/ \E k \in Keys : Revoke(k)
    \/ Restart

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* One request key reaches the provider at most once, across concurrent    *)
(* repeats, results and Host restarts. Harm if broken: a duplicate message *)
(* in the user's chat.                                                     *)
AtMostOnce == \A k \in Keys : sends[k] <= 1

(* An intent that says it was never sent really was never sent, so a       *)
(* message that went out after a crash shows as Unknown Outcome, not as    *)
(* cancelled or revoked. Harm if broken: the Human is told nothing was     *)
(* sent and sends it again.                                                *)
UnsentMeansUnsent == \A k \in Keys : state[k] \in Unsent => sends[k] = 0
=============================================================================
