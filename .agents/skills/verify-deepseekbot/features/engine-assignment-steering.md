# Report from and steer a Subscription Engine Assignment

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
- A Claude Code Assignment can report through the MCP gateway with a Claude subscription.

## How to get to it (user POV)

On an isolated local Host with a signed-in engine, choose it with `engine use <bot> <engine> --role assignment`. Use the existing [Assignment commands](../../../../docs/bot-cli.md#harness-bot-tools-without-the-model) against a disposable Workspace Grant.

## One short Claude subscription report

1. Launch a named isolated Profile with `verify-app launch --no-deepseek-secret` and run doctor. If the Profile's `engine status` says Claude is signed out, run `deepseekbot engine login claude` against that Host and complete the subscription sign-in in the browser. Confirm `login: "subscription"` before selecting Claude.
2. Create a test Bot and a disposable Workspace Grant. Select `engine use <bot> claude --role assignment`. Start one Assignment with `bot-tool <bot> create_assignment --args-stdin`. In the instructions, ask it to call `report_to_orchestrator` with state `completed` and summary `CLAUDE-REPORT-OK` without running other tools.
3. Read `session-transcript` with the returned Assignment Session ID. Require a successful `report_to_orchestrator` tool item. Read `assignment` and `activity` to confirm the report was committed with that Session ID and summary. An unreported-completion fallback does not qualify.
4. Save the engine login classification and the report and transcript results with the source SHA. Stop the isolated Host and confirm its port was released.

## Driving it with verify-app

1. Launch and run doctor. Use `bot-tool <bot> create_assignment --args-stdin` with instructions that keep the engine occupied long enough to steer.
2. Confirm the Assignment is running with `assignment` and `session-transcript`. Run `bot-tool <bot> send_assignment_request --args-stdin` with the Session ID, `mode: "next-step"` and a unique instruction.
3. Check for `delivery: "steer"`. Read `session-transcript` to verify the input appears in the active Codex turn when the steer succeeds. For Claude Code or an explicit Codex refusal, verify the input appears in a new turn in the same Session after the interruption.
4. Read `assignment` and `activity` to verify the requested outcome and its single terminal report. Repeat with the other engine.

## Gotchas

- The replay fixture holds the initial turn open until it sees the steer or interruption. It verifies the Host and Inbox paths without a subscription.
- A signed-in local engine in the isolated Profile is needed to verify actual model behavior.
- Stop the task-owned Host and verify process and port release.
