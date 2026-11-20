# Session context across a Subscription Engine switch

## Sources

- `packages/core/src/engines/{engine-context,engine-host,engine-store}.ts`

## Terms

- Orchestrator Session
- Subscription Engine

## Sub-features

- A new engine thread receives the DSH Session's recent messages and tool output as quoted text. A committed compaction checkpoint replaces the old context it summarizes.
- Later turns can resume the engine thread using its native ID.
- An idle Orchestrator and a settled Assignment release their child process. The next turn resumes the saved native ID.
- If the native session is lost, an existing Session detail row announces the rebuild. An Assignment with missing saved records reports failure to its Orchestrator.
- Returning to a DSH model resumes the same DSH Session with the engine turns in its model-visible history.

## How to get to it (user POV)

Open a Bot's DM on a local Host. Send a fact to the Bot, switch its Orchestrator to Codex, and ask it to recall the fact. Switch its Orchestrator back to the DSH model and ask again.

## Driving it with verify-app

Launch and run doctor against an isolated Host. Use `opencode-go/deepseek-v4.1-flash` for native turns and verify that the Codex subscription is available in `deepseekbot engine status`. Create a Bot, then tell it “My lucky number is 37.” Use `deepseekbot engine use <bot> codex --role orchestrator` and ask for the number. In the Codex turn, also ask the Bot to include a short word of its own choice in the reply. Use `deepseekbot engine use <bot> none --role orchestrator` and ask the Bot to recall the number and that word. For all three prompts, ask the Bot to send its reply without calling Channel history or Memory tools.

Capture the DM through `verify-app shot`. Use `deepseekbot bot-sessions` and `session-transcript` to match the Session ID across all three turns and confirm the tool calls and replies. Inspect `diagnostic-logs` for the native model route and for the absence of an `agent/disposed` listener warning at the first switch.

### Idle and lost native sessions

1. In a task-owned isolated Profile, send a synthetic fact to a subscribed Orchestrator. After the turn settles, record the engine child PID and the saved native ID. Wait for 30 seconds of idle time and confirm the PID exited. Send a second DM and confirm the engine process reopened with the stored native ID and remembered the fact.
2. With the child process stopped, move the disposable native conversation file aside within that Profile. Send another DM asking for the fact. Verify the reply, a new native ID, and the rebuild notice in `session-transcript` under the original Bot Session ID. Use the same procedure for an Assignment and send its next request through `bot-tool`.
3. As a separate destructive fixture confined to the disposable Profile, withhold the Assignment's saved Session events too. The next request should lead to a failed Assignment Report in its Orchestrator's Inbox. Check the Assignment and `activity` using the same Session ID.
4. Verify the shared Assignment Concurrency Limit by keeping one engine Assignment working at a limit of one and trying to create another Assignment. Require a capacity refusal. Confirm the next create succeeds after the first engine child exits and its Assignment settles.

## Gotchas

- The Codex sign-in belongs to the isolated Host's engine home. Authenticate it through the existing Codex login flow.
- A replay can verify the seed at the app-server boundary. The subscription account is required for a live Codex recall result.
