# ADR-0279: Interrupted Human DM turns continue in their Session

- Status: Proposed; first slice covers Bot DM orchestrator turns, Human feedback pending
- Date: 2026-11-02
- Issue: #3308 (goal-driven continuation: #3316)

## Context

A failed Human DM turn could only be retried by replaying the original message, and only while no side effect had started. A long task almost always sends progress or starts Assignments, so it became `needs-repair` and the Human had to mention the Bot again. A Host restart replayed side-effect-free turns from the start and left the others silent. DSH Session Persistence already records every completed tool call and result, and marks a call without a recorded result as having an unknown outcome, so the progress the issue asked to persist already exists.

DSH also ships a goal stack (`dsh-goal`, `dsh-goal-round-driver`, `dsh-tool-goal`, `/goal`) for a model that stops before its objective is done. Its round driver deliberately does not retry transient provider failures and disarms after a restart, leaving that policy to the application.

## Decision

Continue reuses the existing Source Event and orchestrator Session. The Host claims the `retryable` or `needs-repair` attempt again, keeps its side-effect mark and runs one turn whose input is a fixed Host note followed by the original inbound message. The note names the cause and tells the model to continue from its Session history and to check unknown-outcome calls before repeating them. No step ledger or second store is added, and replies keep their original Source Event addressing.

Continue is offered on the orchestrator failure card in the Bot's own DM through `channelRetry` with `recovery: continue` and the existing `deepseekbot channel-retry` command. It is refused when the Bot's Session was replaced or the Bot is busy. Restart in a fresh Session keeps the existing new-session and compact recoveries.

Failures with `TRANSPORT`, `TIMEOUT`, `SERVER`, `RATE_LIMIT` or `EMPTY_RESPONSE` continue automatically after 60 and then 180 seconds, after DSH's own request retries are spent. The schedule is written on the failure card as `autoContinue`; the timer is process-local. Cancel on the card sends `channelBotStop` with `autoContinueFor` set to the request message, which cancels only that waiting continuation and never stops a running turn; a plain Stop also cancels it, and a new Human turn in that DM replaces it. Authentication, quota, credential, context-window and refusal failures never continue by themselves. Turns interrupted by a Host restart continue on start-up in the same way, also after side effects.

The failure card records `progress` read from the native Session log: completed tool calls, the last tool and tools without a result.

When #3316 integrates DSH goals, Continue on a Session with a disarmed goal resumes that goal instead of sending the note; BotHarness does not add its own completion judgement.

## Consequences

Long tasks resume without replaying finished work, and a restart no longer silently drops turns that had side effects. A tool that was in flight can still have run once; the model is told to verify it rather than the Host guessing. A pending automatic continuation survives a Host restart: start-up re-arms it from the newest failure card in the DM when that card's Session is still current, so it runs without Human action. Groups and Assignment Sessions keep their current recovery until a later slice.
