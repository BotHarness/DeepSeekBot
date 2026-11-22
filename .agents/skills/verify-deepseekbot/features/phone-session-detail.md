# Native Bot Session detail

## Sources

- `apps/mobile/app/session/*.tsx`
- `apps/mobile/src/ui/chat/{session-detail-screen,session-transcript-row,session-link-chips,session-model-composer}.tsx`
- `apps/mobile/src/ui/chat/chat-timeline-chrome.tsx`
- `apps/mobile/src/ui/chat/{session-model-label,use-session-transcript,session-navigation}.ts`
- `apps/mobile/src/host/session-detail.ts`
- `packages/host-client/src/session-{detail,model,links}.ts`

## Terms

- Orchestrator Session
- Assignment Session
- Model Choice

## Sub-features

Bot profile Session rows, Session chips inside Bot messages, and the Group Assignment entry all open one Session detail page. The transcript shows messages, activity, live updates, and model switches. The Session header menu offers Stop while a Session is running and Archive or Unarchive for eligible Assignments. The header and composer open the same next-turn Model Choice picker.

## How to get to it (user POV)

Open a Bot's profile, choose **Work**, and tap a Session under **Sessions**. Alternatively, tap a Session chip inside a Bot message or open an Assignment from a Group profile.

## Driving it with verify-app

Use the assigned device in `docs/agents/device-qa.md` and a paired isolated Host with a working model. Use `deepseekbot bot-sessions`, `session-transcript`, and `session-model` to read the same canonical state. Compare a DM with a short draft to the base. Open a current Orchestrator, send a marked follow-up with the keyboard open, and verify it reaches the selected Session. Open a linked Assignment and verify its details, follow-up, and Stop. Open `composer-session-model`, save an allowed choice during an active Turn, and verify the pending label and the subsequent Turn's recorded model. Check English and Chinese, both themes, and a large-text logo-only chip beside Send. Open a long transcript, scroll away from the latest row, and compare its edges with the Bot chat on the same device. Tap **Jump to latest**, then open and dismiss the keyboard with an unsent draft.

## Observable proof

Back returns to the origin of each entry. The Sessions list and the detail title capsule show the Session title. The latest row opens above the composer. As the transcript scrolls under the iOS navigation bar or Android top app bar, the shared fade softens its top edge. The transcript also scrolls under the composer. **Jump to latest** returns to the last row, and the focused field stays above the keyboard. The Session options control opens the native pull-down menu on iOS or anchored Menu on Android. Archive and Unarchive appear for idle Assignments, and the resulting archive state matches `deepseekbot bot-sessions`. Sent links appear above the message text and newly created links appear below it. Multiple links of the same kind fold into a count button that expands and collapses the chips. A linked Assignment waiting for the Human shows a warning next to its chip. A purged Bot message never shows a Session chip. A direct message shows the Human’s words, and an Inbox-only wake opens through `session-transcript-inbox-disclosure`. A failed Turn shows all recovery text. The selected Session ID and Bot agree with the Host transcript, follow-up, and saved Model Choice. The model switch appears in the timeline and the DM composer lacks a Model Choice chip. An unauthorized Team member cannot read or send to the Session through its route.

On an isolated Host, simulate a failed Sessions read and a failed Assignment details read. Verify that **Try again** restores each read. Keep a cached Sessions list visible through a failed refresh, and keep the Assignment transcript and composer available while retrying its details.

## Gotchas

- A historical Orchestrator can be read. The Host only accepts direct sends to the Bot's current Orchestrator.
- Direct Session commands accept text. The Session composer displays an unavailable attachment control.
- An iOS Simulator capture only covers that Simulator and its installed binary.
