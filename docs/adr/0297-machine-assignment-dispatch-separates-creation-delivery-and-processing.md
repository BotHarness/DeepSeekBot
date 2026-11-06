# ADR-0297: Machine Assignment dispatch separates creation, delivery and processing

- Status: Proposed; frozen issue constraints recorded for implementation review
- Date: 2026-11-06
- Issues: [#3578](https://github.com/BotHarness/DeepSeekBot/issues/3578), [#3351](https://github.com/BotHarness/DeepSeekBot/issues/3351)
- Delivery status: specification only; no machine dispatch endpoint or CLI is implemented by this ADR

## Context and current implementation

A machine caller needs to create an Assignment, deliver a request and recover its result without running a model Turn. The existing direct Bot tool runner executes as a Bot's Orchestrator; it is not a machine identity boundary. `TURN_ONLY_BOT_TOOLS` deliberately excludes `create_assignment`, `send_assignment_request` and `wait_for_assignment`. Removing those entries would expose the wrong authority.

At baseline `1ae0abf5fdbd174bb621e1de821c545a19374458`:

- `packages/core/src/runtime/dsh-bot-agent-adapter.ts` owns that exclusion; `packages/core/test/direct-bot-tools.test.ts` asserts the direct catalog omits every excluded tool.
- `BotRuntime.runDirectBotTool` in `packages/core/src/runtime/bot-runtime.ts` returns `tool-not-direct` for an excluded tool.
- `packages/core/src/bridge/owner-compat.ts` recognizes the authenticated owner. It does not mint a machine principal or authorize a service against a target.
- `AssignmentRequestDelivery` describes process-local `steer` or `followup` acceptance/completion Promises. These are not durable, keyed machine delivery receipts.
- `packages/core/src/runtime/assignment-delivery.ts` represents uncertain native Inbox acceptance explicitly. A thrown error does not prove that a request was never accepted.

Existing Assignment ownership, Workspace Grants, native Session history and the Operational Database remain authorities. [ADR-0295](0295-assignments-stay-active-until-archived.md) makes failed Turns distinct from archived Assignments; its model tool may explicitly unarchive and retry. Machine dispatch must preserve the runtime's `assignment-ended` refusal and must not silently inherit that tool behavior.

## Proposed capability boundary

This is an **application-defined Service Definition**, owned by the Host's Assignment capability. A machine transport and the `deepseekbot` CLI are Consumers of the same Provider. The new capability must not impersonate a Bot Turn, inherit a caller Session, or mint permissions from request fields. The concrete authenticated transport and credential provisioning contract remain a prerequisite in #3351; this ADR does not assert that DSH already provides them.

Conceptual operations, not published method signatures:

```text
create(intentKey, request)                  -> creation receipt
deliver(deliveryKey, assignmentId, request) -> durable admission receipt
observe(intentKey | assignmentId, deliveryKey?) -> creation, deliveries, processing, lifecycle
```

`intentKey` identifies a creation intent. `deliveryKey` identifies one request delivery. They have distinct namespaces and never substitute for one another. A successful creation returns stable `assignmentId`, `sessionId` and initial state. Creation alone does not establish delivery acceptance. Whether create accepts initial request text must be settled before publishing its wire schema; it must not introduce an unkeyed initial delivery.

The Host's durable intent-to-Assignment mapping produces both observation views. An input claiming an unrelated intent and Assignment cannot join their histories. Observation must authorize its resolved target before exposing records.

Creation requires a unique, immutable binding of `(authenticated subject, intentKey)` to the canonical creation request and one stable Assignment/Session identity. Concurrent calls with the same binding return that same creation result; a changed target or body returns `key-conflict` without exposing another target's receipt. Creation and the intent mapping must commit atomically, or use a qualified recovery protocol that durably reserves the identity before native Session creation and reconciles that exact identity after a crash. Such a protocol must prove idempotent native allocation or authoritative lookup of the reserved identity; an uncertain allocation must remain unknown rather than allocate a replacement. A crash between native creation and mapping completion cannot create a second Assignment. Replays recheck current authorization and cannot rebind an old intent.

Both observation entry points support an optional `deliveryKey` filter scoped to the authenticated subject and resolved Assignment. Each returned delivery carries its authorized original `deliveryKey` alongside `deliveryId`, so a caller can correlate a lost receipt without already knowing the server-generated ID. Never expose another subject's keys or resolve a key across targets; a missing authorized record remains `unknown`. Aggregate delivery views apply the same subject scope. Ordering or timestamps are not a substitute for this correlation.

## Identity and immutable binding

The Host constructs `principal=system` from authenticated machine context. Before input normalization, reject owner credentials, Session credentials and mixed credential classes. Reject body-supplied `principal` or `system.id`; do not silently discard these fields. Every admission, including replay, rechecks current subject-to-target authorization and the target's current Grant. Current authentication failure never rewrites an older receipt.

Request bodies cannot override Workspace, Grant, approval policy or tool set, or inherit a caller Session. Any retained model selector must be an explicit non-escalating allowlist. Machine credential scope cannot widen a Bot's execution authority.

The server computes a canonical body digest. Freeze its normalization, algorithm and version before implementation ships. A delivery key binds the authenticated subject, Assignment and canonical body digest. Reusing it for another target or body yields `key-conflict` without revealing that other target's receipt. A caller-supplied `requestHash` is not authoritative. Delivery digests neither identify artifacts nor establish artifact verification.

## Admission and replay

An `accepted` result requires one durable commit containing the unique delivery record, its `sourceEventId` and the Inbox admission fact. If these cannot share a transaction, the implementation must first qualify an equivalent crash-recovery protocol. Replays preserve the same event identity and Inbox deduplication. A receipt cannot say accepted while the request has no recoverable admission.

`refused(code)` is also durable and queryable. It records only the refusal decision: no Inbox event and no pending slot. `assignment-ended`, `no-grant` and `queue-full` are required refusal cases. Validation and current authentication errors are distinct from stored admission decisions.

After current authentication, authorization and immutable binding checks, replay an existing in-window key's original `deliveryId` and admission result, including refusals. Only a new key evaluates capacity. A replay of `queue-full` stays refused after capacity becomes free; a distinct request needs a distinct key. `unknown` is a caller's lack of knowledge, never a stored first result.

Retain key mappings and deduplication records throughout the agreed window. Outside that window, old keys must be explicitly refused; deletion must not make them look new. The window duration, expiry recognition mechanism, refusal code and relation to historical observation are release-blocking protocol choices. Wall-clock guesses by callers are not evidence that a key is fresh.

## Processing and capacity

`accepted` and `processed` answer different questions. Track processing per delivery with `deliveryId`, `sourceEventId` and the target's `handledUnitId`. The target processing path writes the durable terminal fact and `processedAt`; the transport cannot infer completion from a reply or a resolved request Promise.

| Processing fact                                 | Terminal?                                      | Capacity slot |
| ----------------------------------------------- | ---------------------------------------------- | ------------- |
| Accepted, pending, running or consumed          | No; `processedAt=null`                         | Occupied      |
| Successful handled unit termination (`replied`) | Yes, persisted                                 | Released      |
| Failed or cancelled handled unit termination    | Yes, persisted                                 | Released      |
| Missing or uncertain terminal evidence          | Unknown; do not fabricate a terminal timestamp | Occupied      |

`processed` means persisted handled-unit termination, not business success or an Artifact Verdict. An intermediate reply does not imply `replied`. Reports and rounds must retain their delivery correlation.

For the first implementation, `maxPending=1`: accepted deliveries without a durable terminal fact occupy the slot, including running work. Compare capacity and reserve that slot in the same admission commit. Concurrent new keys cannot both be accepted. A refusal and a replay allocate no slot. Future queuing requires an explicit `queued` contract rather than weakening this predicate.

## Observation, interruption and recovery

Absent records and transport timeouts yield `unknown`, never proof of non-delivery. After an uncertain attempt the caller uses observe; uncertainty does not authorize resending, generating a replacement key or recreating an Assignment. Host recovery may reconcile an existing intent under a qualified protocol; it does not manufacture a second delivery identity.

A Session interruption does not rewrite an accepted delivery to unknown. Observation returns delivery facts and lifecycle facts independently. `stopped`, `stoppedBy`, `revoked` and `revokedAt` come only from their owning durable authority. Missing lifecycle evidence stays unknown; a tool refusing reuse is not evidence of an aborted Session. The lifecycle state set and any `resumable` promise belong to #3351 and need separate qualification against stop, archive and Grant behavior.

Native Agent Inbox acceptance is a separate boundary from application-owned admission. Before implementation, prove how the same `sourceEventId` survives a crash between those boundaries and how recovery deduplicates it. A process-local Cordis Event, Promise, in-memory lock or retry loop is not that proof. Emit live notifications only after canonical facts commit; query views remain rebuildable.

## Runnable delivery sequence and acceptance gates

Deliver one vertical slice through authenticated transport, Host owner, canonical persistence, CLI and observation before expanding variants. Its first live scenario is one machine identity, one granted Assignment and one text request. This does not waive negative or recovery gates for that slice.

| Gate                                                           | Required observable result                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Same delivery key twice                                     | One delivery record, one Source Event, one Inbox admission, same receipt.                                                                                                                                                                                          |
| 2. Crash before/after commit and at native Inbox boundary      | Restart preserves one accepted fact iff there is one recoverable admission; no orphan or duplicate execution input.                                                                                                                                                |
| 3. Changed Assignment/body, forged digest or mismatched intent | Coded rejection; no cross-target receipt or aggregate disclosure.                                                                                                                                                                                                  |
| 4. Ended Assignment, revoked Grant and concurrent capacity     | Required refusals; concurrent new keys produce exactly one accepted admission.                                                                                                                                                                                     |
| 5. Observation while admission is paused                       | Unknown before commit; accepted only after its durable fact exists.                                                                                                                                                                                                |
| 6. Caller killed after submission                              | Two concurrent different delivery keys lose both receipts: both observation entry points correlate accepted and refused results to their original keys, with no cross-subject disclosure or resend.                                                                |
| 7. Two rounds                                                  | Only durable terminal release permits the next accepted delivery; reports correlate to their own delivery.                                                                                                                                                         |
| 8. Lifecycle and interruption                                  | Authoritative stop/revoke facts remain separate from acceptance; an interrupted Session retains its accepted receipt.                                                                                                                                              |
| 9. Identity and policy negatives                               | Owner/Session/mixed credentials, forged identity, wrong service scope and body policy overrides are refused.                                                                                                                                                       |
| 10. Key window and first-result replay                         | In-window refusals remain identical; expired old keys cannot become new after cleanup or restart.                                                                                                                                                                  |
| 11. Concurrent creation and creation crash recovery            | Concurrent calls with the same subject/intent return one Assignment and Session; changed target/body conflicts. Crashes before/after reservation, native creation and mapping completion recover that same identity or remain unknown, never allocate a duplicate. |

Automated crash/concurrency coverage and a real isolated Host CLI run are required. No new capability may be declared complete from store tests alone. Ship CLI commands, coded refusals and bilingual CLI documentation with the first runtime slice; retain model-free execution. This specification adds no route, Bridge method, tool or CLI command.

## Open protocol choices and consequences

Before marking this proposal accepted, freeze the minimum request schema, creation-to-first-delivery relationship, canonical digest version, machine credential lifecycle and subject-to-target scope, key-window protocol, delivery ordering and pagination. Identify the exact durable handled-unit correlation and admission/native Inbox recovery mechanisms. Keep future queue size and latest-first policies outside the first slice.

Stop/resume operations, cross-Bot orchestration, push callbacks, UI, detailed Assignment timelines and Artifact Verdict storage are non-goals. The design preserves uncertainty rather than promising exactly-once external side effects. #3351 and #3578 remain open until their respective decisions and runtime acceptance scope are satisfied; publication of this ADR alone is not a runtime fix.
