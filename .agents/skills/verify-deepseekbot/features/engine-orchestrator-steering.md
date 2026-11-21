# Steer a running Subscription Engine Orchestrator

## Sources

- `packages/core/src/engines/assignment-steering.ts`
- `packages/core/src/engines/engine-gateway.ts`
- `packages/core/src/engines/engine-host.ts`
- `packages/core/src/engines/engine-turn-scope.ts`
- `packages/core/src/runtime/bot-runtime.ts`
- `packages/core/test/engine-orchestrator-steering.test.ts`

## Terms

- Orchestrator Session
- Subscription Engine
- Source Event
- Channel

## Sub-features

- Codex receives a Group mention, DM or Inbox context in its active turn.
- Claude Code interrupts and continues in the same Session without repeating a committed reply.
- A refused Codex steer leaves the Inbox Admission pending for the next turn.
- Each trusted Source Event keeps its own reply Channel and the gateway checks current Bot membership.

## How to get to it (user POV)

Select Codex or Claude Code as the Bot's Orchestrator on a local Host. Add the Bot and two Humans to a Group. With Group mention delivery set to steer, mention the Bot and have the second Human mention it while it is working. Send it a DM during the same run.

## Driving it with verify-app

1. Relaunch the isolated local Profile with an existing subscription. Run doctor and confirm the account class with `deepseekbot engine status`.
2. Create a test Bot and authenticate two Humans. Use existing Channel sends or the Web message composer to send synthetic markers. Confirm the engine is running with `session-transcript` before sending the second mention and the DM.
3. Read the Session transcript and the two Channel histories. Require both updates in the active Codex turn, or an interrupted turn followed by the update in the same Claude Session. The Group reply addresses both Humans. The DM reply appears only in the DM. Check the absence of duplicate replies.
4. Capture the Group and DM in the Web client. Keep the Channel readbacks, transcript and evidence with the verified source identity. Stop the owned Host and verify port release. Preserve any reused subscription Profile.

## Gotchas

- A replay proves explicit Codex refusal and pending-Inbox fallback without relying on a provider failure.
- When both sends can reach the Host near turn startup, wait for the first model input in the Session transcript before sending the update.
- A Group with send review enabled may require a fresh Channel read before sending.
