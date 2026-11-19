# Steer a running Subscription Engine Assignment

## Sources

- `packages/core/src/engines/{assignment-steering,claude-engine,codex-engine,engine-host}.ts`

## Terms

- Subscription Engine
- Assignment Request
- Assignment Report

## Sub-features

- Codex accepts the request against the active turn ID.
- Claude Code interrupts the current turn and starts a turn with the request in the same Session.
- Both paths produce one terminal report in the Bot Inbox.

## How to get to it (user POV)

On an isolated local Host with a signed-in engine, choose it with `engine use <bot> <engine> --role assignment`. Use the existing [Assignment commands](../../../../docs/bot-cli.md#harness-bot-tools-without-the-model) against a disposable Workspace Grant.

## Driving it with verify-app

1. Launch and run doctor. Use `bot-tool <bot> create_assignment --args-stdin` with instructions that keep the engine occupied long enough to steer.
2. Confirm the Assignment is running with `assignment` and `session-transcript`. Run `bot-tool <bot> send_assignment_request --args-stdin` with the Session ID, `mode: "next-step"` and a unique instruction.
3. Check for `delivery: "steer"`. Read `session-transcript` to verify the input appears in the active Codex turn when the steer succeeds. For Claude Code or an explicit Codex refusal, verify the input appears in a new turn in the same Session after the interruption.
4. Read `assignment` and `activity` to verify the requested outcome and its single terminal report. Repeat with the other engine.

## Gotchas

- The replay fixture holds the initial turn open until it sees the steer or interruption. It verifies the Host and Inbox paths without a subscription.
- A signed-in local engine in the isolated Profile is needed to verify actual model behavior.
- Stop the task-owned Host and verify process and port release.
