# Session context across a Subscription Engine switch

## Sources

- `packages/core/src/engines/{engine-context,engine-host,engine-store}.ts`
- `packages/core/src/runtime/{session-model-choices,session-transcript,turn-targets}.ts`
- `packages/client/src/client/session-model-*.tsx`
- `apps/mobile/src/ui/chat/turn-model-switch.tsx`

## Terms

- Orchestrator Session
- Subscription Engine
- Model Choice
- Routing Group

## Sub-features

- A new engine thread receives the DSH Session's recent messages and tool output as quoted text. A committed compaction checkpoint replaces the old context it summarizes.
- Later turns can resume the engine thread using its native ID.
- An idle Orchestrator and a settled Assignment release their child process. The next turn resumes the saved native ID.
- If the native session is lost, an existing Session detail row announces the rebuild. An Assignment with missing saved records reports failure to its Orchestrator.
- Returning to a DSH model resumes the same DSH Session with the engine turns in its model-visible history.
- `session-model-presentation`: The desktop Session detail header shows the title and progress. Its timeline marks only Turns where the recorded model changed and shows the Routing Group fallback reason when available. Check the short catalog name, brand logo and Sub or API badge. Models without a catalog entry display their ID. The phone conversation shows the Turn marker on its first visible reply, and the message menu retains time and the full model path.
- `session-model-choice`: Open a root Session in the desktop Sessions panel and use Model Choice in its composer. Pick a Model Choice (a model or Routing Group) while a Turn runs. The chip says “Next turn” with the selected name. When the current Turn completes, send the next prompt and verify the model switch. Use “Use Bot default” to clear and verify the next Turn returns to its default. Repeat for an Assignment when its composer is available. A Team member’s list and Host mutation require grants for the choices. Use `session-model` and `session-transcript` to compare the saved choice, the active Turn’s choice and recorded model switches.
- `session-human-input`: Send a DM and a Group mention to an engine-backed Bot. Open its Orchestrator Session from Sessions and check that the title and each input use the Human text. Repeat with a message steered into an active turn and compare to the inputs in `session-transcript`.

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
