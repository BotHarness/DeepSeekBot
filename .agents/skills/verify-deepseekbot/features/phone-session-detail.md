# Native Bot Session detail

## Sources

- `apps/mobile/app/(tabs)/(home,sessions)/session/*.tsx`
- `apps/mobile/src/ui/chat/{session-detail-screen,session-transcript-row,session-link-chips,session-model-composer}.tsx`
- `apps/mobile/src/ui/chat/chat-timeline-chrome.tsx`
- `apps/mobile/src/ui/chat/{session-model-label,use-session-transcript,session-navigation}.ts`
- `apps/mobile/src/host/session-detail.ts`
- `packages/host-client/src/session-{detail,model,links}.ts`
- `packages/core/src/runtime/session-transcript.ts`
- `packages/host-protocol/src/dsh-model-switch.ts`
- `packages/client/src/client/native-session-model-switch.tsx`

## Terms

- Orchestrator Session
- Assignment Session
- Model Choice

## Sub-features

Bot profile Session rows, Session chips inside Bot messages, and the Group Assignment entry all open one Session detail page. The transcript shows messages, activity, live updates, and model switches. The Session navigation bar menu (the iOS navigation bar or the Android top app bar) offers Stop while a Session is running and Archive or Unarchive for eligible Assignments. The navigation bar and composer open the same next-turn Model Choice picker.

## How to get to it (user POV)

Enable **Sessions** in Settings → Interface, then open the **Sessions** tab and tap a Session. You can also open a Session from a Bot profile’s **Work** tab, a Session chip inside a Bot message, or an Assignment in a Group profile.

## Driving it with verify-app

On Android, open a Session from the **Sessions** tab. Verify that the transcript opens and the Session top app bar shows Back, the Session title capsule, and the Session options button. Open the options menu, dismiss it, and use Back to return to **Sessions**.

Open a native DSH Session and send a prompt. Open **Model Choice**, select a route that uses a different model, and send a second prompt. On phone and in the desktop DSH Chat view, the second exchange shows one localized switch marker with the two brand icons and short model names. The internal DSH model-selection notice is absent from the timeline. Reopen the Session to check the same result in saved history. Use `deepseekbot session-transcript --session <id>` to confirm one typed `model-switch` item.

Use the assigned device in `docs/agents/device-qa.md` and a paired isolated Host with a working model. Use `deepseekbot bot-sessions`, `session-transcript`, and `session-model` to read the same canonical state. Compare a DM with a short draft to the base. Open a current Orchestrator, send a marked follow-up with the keyboard open, and verify it reaches the selected Session. Open a linked Assignment and verify its details, follow-up, and Stop. Open `composer-session-model`, save an allowed choice during an active Turn, and verify the pending label and the subsequent Turn's recorded model. Check English and Chinese, both themes, and a large-text logo-only chip beside Send. Open a long transcript, scroll away from the latest row, and compare its edges with the Bot Conversation screen on the same device. Tap **Jump to latest**, then open and dismiss the keyboard with an unsent draft.

## Observable proof

Back returns to the origin of each entry. The Sessions list and the detail title capsule show the Session title. The latest row opens above the composer. As the transcript scrolls under the iOS navigation bar or Android top app bar, the shared fade softens its top edge. The transcript also scrolls under the composer. **Jump to latest** returns to the last row, and the focused field stays above the keyboard. Tapping the Session name capsule opens the Session options, with no separate ⋯ button: a native pull-down menu on iOS or an anchored Menu on Android, headed by the full Session name. Archive and Unarchive appear for idle Assignments, and the resulting archive state matches `deepseekbot bot-sessions`. Sent links appear above the message text and newly created links appear below it. Multiple links of the same kind fold into a count button that expands and collapses the chips. A linked Assignment waiting for the Human shows a warning next to its chip. A purged Bot message never shows a Session chip. A direct message shows the Human’s words, and an Inbox-only wake opens through `session-transcript-inbox-disclosure`. A failed Turn shows all recovery text. The selected Session ID and Bot agree with the Host transcript, follow-up, and saved Model Choice. The model switch appears in the timeline and the DM composer lacks a Model Choice chip. An unauthorized Team member cannot read or send to the Session through its route.

On an isolated Host, simulate a failed Sessions read and a failed Assignment details read. Verify that **Try again** restores each read. Keep a cached Sessions list visible through a failed refresh, and keep the Assignment transcript and composer available while retrying its details.

Long-press the text of a Bot message that contains a Session chip. Check that the message actions include Copy and show the recorded model and time. Dismiss the actions, then tap the chip and check that Session detail opens. With a screen reader, check that the message actions and each chip are reachable separately, and that a reply can jump to its original message.

## Gotchas

- A historical Orchestrator can be read. The Host only accepts direct sends to the Bot's current Orchestrator.
- Direct Session commands accept text. The Session composer displays an unavailable attachment control.
- An iOS Simulator capture only covers that Simulator and its installed binary.
