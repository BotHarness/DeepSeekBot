# ADR-0147: Onboarding is Profile progress over canonical DM evidence

- Status: Accepted
- Amended by: [ADR-0155](0155-onboarding-tutorial-is-a-floating-tour-replayed-from-bot-settings.md) — the tutorial surface is a floating driver.js tour auto-presented on first welcome-card entry; Continue/Restart replay moves to Bot Settings, with no persistent strip.
- Date: 2026-10-08
- Issues: [#1174](https://github.com/BotHarness/DeepSeekBot/issues/1174), [#1175](https://github.com/BotHarness/DeepSeekBot/issues/1175)

## Context

The first Bot-mode experience needs a useful nonblank DM before model credentials exist. Refresh, several Clients and interrupted preparation must not create competing PersonaBots or misreport a welcome card as a successful conversation. Tutorial interaction and core success have different lifetimes.

## Decision

An application-defined Onboarding owner persists one Profile receipt in the existing operational database, schema generation 71. It starts only through deliberate Bot-mode entry. Record a stable intended PersonaBot identity before using the existing Registry/Memory lifecycle. Empty Profiles prepare DeepSeek Bot with a saved website mascot Appearance; existing identities remain selectable and archived/deleted identities are never automatically restored. The existing Channel owner prepares the real Human DM and appends one deduplicated, product-authored system welcome. No synthetic Agent reply or second message store is introduced.

Completion is historical evidence of a Human request followed by a nonempty model-authored reply in the same Human DM, from that DM's Bot. The canonical Channel append transaction records trusted runtime Session ownership and request Source Event provenance alongside the output Source Event. The Onboarding owner reconciles that evidence after notifications, refresh and restart; acceptance, failures, tool questions and arbitrary Bot notices do not qualify. Memory writes and external bindings are independent optional experiences.

Tutorial state is separate Profile data: not started, active, paused or skipped. Explicit Start/Continue/Restart controls it; restart preserves resources, model settings, conversations, completion and companion preferences. Client-local session storage retains only unsent intent and never triggers a send on restoration. Allocating the normal Human message ID transfers ownership out of the onboarding draft; response loss then reconciles that original message rather than offering the same draft as a new submission. Local companion initialization is once per Client/Profile and respects existing preferences, including an empty selection. Progress refresh does not navigate away from the current Channel.

Model saving and question sending are separate Human actions. The standalone model entry saves settings without inventing a question; a blocked request remains Client-local after model save and opens a distinct send-review step. Closing or restoring either step never submits the request.

Native model and credential Services remain the sole authorities. Provider Directory and redacted Settings locate explicit credential references; `Credentials.describe` supplies presence only, without a hidden model request or a second secret store. Ambient routes without a declared reference remain owned by their native adapter. The checked Profile-default option saves through the native default-model Service and verifies readback; the selected Bot then inherits. Unchecking saves an individual Model Plan. Absence of a plan means inheritance, with a retained revision counter protecting a later return to inheritance from stale edits. Global changes affect subsequent inheriting requests, not existing fixed plans or running Assignment Sessions.

The explicit Retry this message command uses the original Human message and Inbox Admission. Existing retryability and side-effect fences decide whether replay is safe. An accepted send recovered by its original message ID is distinct from replaying a failed Admission. No refresh, configuration repair or other Client submits a request automatically.

DSH seams remain Service Definition/Provider/Consumer and Typert/API Gateway for commands; real Agent/Session execution owns model replies. The receipt and Channel provenance are application-defined persistence, not SessionEvents or another execution lifecycle. Driver.js adds temporary presentation only and is destroyed during model configuration and after success.

## Consequences

Generation 71 is forward-only; a binary supporting only generation 70 cannot reopen this Profile safely. Rollback requires a compatible binary or the pre-upgrade backup, while retaining the independent Purge Ledger and enforcing its monotonic facts as required by generation 68. The receipt can be recomputed from canonical evidence after a missed notification, while unsent text and companion preferences remain isolated to the Client. After Human feedback, the welcome offers capability introduction, today’s news, a daily news summary and a ten-minute schedule test as ordinary Human DM requests through existing execution capabilities. These examples do not introduce another news or scheduler authority. Optional guided Memory/IM breadth still requires Human feedback before expansion.

## Refinement: independent Orchestrator selection

[ADR-0218](0218-quick-model-selection-only-customizes-the-orchestrator.md) allows a Bot Model Plan to fix only its Orchestrator while its Assignment policy continues to inherit the Profile default. Both `assignmentDefault` and `assignmentModels` are absent in that case. Existing complete plans and reusable Model Presets retain their previous semantics. An Assignment without a retained route continues to inherit on later requests, rather than adopting a subsequently configured Bot default.
