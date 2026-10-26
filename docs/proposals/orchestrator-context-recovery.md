# Orchestrator context recovery

Status: design confirmed by the Human on 2026-10-26; implementation and verification in progress.

## Report

The Human reports that automatic compaction does not prevent repeated failures. The supplied screenshot displays `Agent turn ended without completion: max-tokens` for an Orchestrator. This is evidence of the displayed failure, not yet proof of context-window exhaustion. The installed Host version, effective policy and original provider outcome still need verification.

## Confirmed choices

- Provide recovery buttons on both Web and the mobile app.
- A fresh-session recovery button explicitly says that it starts a new Session and retries. It retries only the selected failed message.
- Ordinary `/new` switches the Orchestrator Session without automatically retrying a message.
- External IM expansion is outside this slice; preserve and reuse existing capabilities.
- A compaction recovery button says “Compact and retry”. Retry only the selected failed message after successful compaction. If compaction fails, retain the failure and offer fresh-session recovery; never automatically discard working context.
- Fresh-session recovery preserves Channel history, the Bot's Memory Repository and existing Assignments. It resets only the Orchestrator's working context, without copying the old transcript wholesale; details not saved to Memory may be unavailable.
- For confirmed context-window exhaustion, expose both recovery buttons directly. For `max-tokens`, keep ordinary retry and expose compaction and fresh-session recovery under additional recovery options, without labeling the cause as context exhaustion.
- Automatic compaction thresholds follow the selected model's context capacity rather than a fixed 400K. Keep automatic compaction enabled by default while preserving an explicit Human opt-out of Idle Compaction.
- Refuse recovery while the Bot is busy, offering guidance to wait or stop first. Queue new arrivals during recovery and process them afterwards. Repeated clicks must not execute the recovery twice.
- Recovery from an old failure card must check the current Orchestrator Session. If it has changed, report that the Session was updated without resetting it again or automatically retrying. Ordinary explicit retry remains available under its existing checks.
- After Host restart, compaction recovery should load the original Session and compact it without requiring a new Human message or starting a normal Bot turn. On failure, offer fresh-session recovery without silently switching Sessions.

## Proposed unknown-capacity fallback

The Human confirmed 200K when model capacity is unknown. Treat 200,000 tokens as an estimated context capacity, not a verified provider limit and not the compaction trigger itself. Apply output reservation and compaction safety headroom to the estimate. Reliable model capacity must override this estimate. A model with an actual capacity below the estimate can still overflow; retain explicit recovery and do not claim the fallback guarantees prevention.

The Human additionally requested current Orchestrator context occupancy/capacity in the existing Web composer usage chip (for example, approximately 100K / 1M). Preserve access to cumulative usage, identify estimated capacity, and show unknown occupancy for an unloaded Session rather than zero.

## Existing boundaries

Orchestrator Session, Channel history and Memory Repository are different concepts. Recovery must specify which changes rather than treating them as one conversation store.

The repository already has idle Orchestrator replacement and manual compaction capabilities. `packages/core/test/bot-new-session.test.ts` covers archiving an idle old Session and using another Session for the next message, refusing a running Bot, and restoring the old Session on withdrawn authority. `packages/core/src/runtime/idle-compaction-settings.ts` defaults missing settings to enabled. Idle Compaction is distinct from native threshold-triggered compaction.

ADR-0024 now distinguishes the normal stable Session lifecycle from explicit Human-requested replacement. The living architecture records recovery ownership, model capacity fallback and the context query; no new glossary term is required.

## Remaining evidence and confirmation

- Verify effective native automatic compaction policy, model-capacity resolution, and the reported deployment's original provider outcome before diagnosing the screenshot as context exhaustion.
- Verify recovery serialization, retry admission, stale-card checks and cold Session loading through the existing Host owners. Retrying a failed message is not a rollback of external effects that its earlier attempt may already have performed.

The implementation reuses native compaction and the runtime's per-Bot queue. Recovery retains existing Source Event retry safety checks: an earlier uncertain external effect is not permission to replay it.

## Implementation verification (2026-10-26)

- 83 focused tests passed across recovery, compaction, Session replacement, failure-card controls, mobile parsing and CLI arguments. Build and release-fragment validation passed.
- Isolated DSH 0.2.1-rc.2 returned 28,039 current tokens, 1,000,000 model-declared capacity and an 800,000 automatic threshold. Web rendered the context chip and recovery buttons with no browser errors. The real CLI returned matching values.
- Clicking New session and retry produced a different canonical Session ID and a failure associated with the same original Human message; history remained present. The provider returned QUOTA, so this proves replacement and retry routing, not a successful model reply.
- After restarting the isolated Host, the context query correctly returned unknown usage until loading. The real bot-compact command loaded the original Session and returned nothing-to-compact with 28,039 tokens before/after, without a Human message.
- Successful provider-backed summary generation and actual unknown-capacity overflow remain unverified because the configured provider rejected model calls for quota. Native mobile device checks are queued, not qualified. Whole-workspace type checks still contain existing dependency/type failures; focused changed-file checks and lint found no new errors.

## Confirmed PR refinements

The footer shows only `28K / 1M`, with neither an approximation mark nor a Context label. Its popover separates current estimated occupancy, capacity, remaining space, automatic threshold and capacity source from cumulative usage. Compact and New session actions are available only in the Bot Human DM; neither action retries an old message. Groups do not expose these controls.

Failed-message feedback reuses the existing Web/mobile form and POST endpoint. The explicit failure entry preselects negative feedback. The upload adds only the canonically matched turn input and tool calls/results; the full diagnostic archive remains a separate download. Missing or ambiguous turn identity refuses, secrets use the existing redactor, and evidence over 128 KiB refuses. These refinements were requested after the original runtime verification; current-head evidence supersedes earlier screenshots.

## Current PR verification

The PR is rebased onto main `ff51ffcb1e3d87cfb5ca1b2ef999eed39a810d03` with DSH 0.2.1-rc.3. 133 focused tests pass, the root TypeScript check passes, the build passes, and CLI parity/source-policy checks pass. Native mobile type checking still has existing React type/dependency errors; device QA is pending. Matched 1440×1000 English/light before/after captures use the same isolated synthetic Bot and Channel. The real failed-turn preview identified the request and exposed redacted upload evidence; ingestion is covered by mocked contract tests, not a production upload. Provider quota continues to block successful summary generation.
