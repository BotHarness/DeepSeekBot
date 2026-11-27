# Native Bot Session detail

## Sources

- `apps/mobile/app/(tabs)/(home,sessions)/session/*.tsx`
- `apps/mobile/src/ui/chat/{session-detail-screen,session-transcript-row,session-link-chips,session-model-composer}.tsx`
- `apps/mobile/src/ui/chat/chat-timeline-chrome.tsx`
- `apps/mobile/src/ui/chat/{chat-header-row,chat-header-actions.ios,conversation-top-bar.android,session-title-menu.ios}.tsx`
- `apps/mobile/src/ui/chat/{session-model-label,use-session-transcript,session-navigation}.ts`
- `apps/mobile/src/host/session-detail.ts`
- `apps/mobile/src/features/sessions/native-session-input.ts`
- `apps/mobile/src/features/sessions/native-session-input-cards.tsx`
- `apps/mobile/src/ui/chat/{approval-card,question-card}.tsx`
- `packages/host-client/src/session-{detail,model,links}.ts`
- `packages/host-client/src/host-sessions.ts`
- `packages/core/src/features/sessions/dsh-host-session-input.ts`
- `packages/core/src/features/activity/native-session-attention.ts`
- `packages/core/src/runtime/session-transcript.ts`
- `packages/host-protocol/src/dsh-model-switch.ts`
- `packages/client/src/client/native-session-model-switch.tsx`

## Terms

- Orchestrator Session
- Assignment Session
- Model Choice

## Sub-features

Bot profile Session rows, Session chips inside Bot messages, and the Group Assignment entry all open one Session detail page. The transcript shows messages, activity, live updates, and model switches. The Session navigation bar menu (the iOS navigation bar or the Android top app bar) offers Stop while a Session is running and Archive or Unarchive for eligible Assignments. For a Host Owner, a native Session also offers Stop while running and Archive (with a confirmation) while idle, and shows the approval and question cards it is waiting on above the composer; a Team member never sees these controls. The navigation bar and composer open the same next-turn Model Choice picker.

## How to get to it (user POV)

Enable **Sessions** in Settings → Interface, then open the **Sessions** tab and tap a Session. You can also open a Session from a Bot profile’s **Work** tab, a Session chip inside a Bot message, or an Assignment in a Group profile.

## Driving it with verify-app

On each platform, open a group Channel and a Session on the same device at default, intermediate and maximum text sizes, in both themes. Compare the floating row, the round action sizes, and the title capsule over scrolled messages. The Session capsule shows the Computer and folder, and tapping it opens the full Session information and options. In Drawer style, ☰ opens the Sessions drawer and ✎ starts a new Session for the Host Owner. In Stacked style, Back returns to the list and ✎ starts a new Session. Open a Session from Chats and verify that Back returns there.

Open a native DSH Session and send a prompt. Open **Model Choice**, select a route that uses a different model, and send a second prompt. On phone and in the desktop DSH Chat view, the second exchange shows one localized switch marker with the two brand icons and short model names. The internal DSH model-selection notice is absent from the timeline. Reopen the Session to check the same result in saved history. Use `deepseekbot session-transcript --session <id>` to confirm one typed `model-switch` item.

Use the assigned device in `docs/agents/device-qa.md` and a paired isolated Host with a working model. Use `deepseekbot bot-sessions`, `session-transcript`, and `session-model` to read the same canonical state. Compare a DM with a short draft to the base. Open a current Orchestrator, send a marked follow-up with the keyboard open, and verify it reaches the selected Session. Open a linked Assignment and verify its details, follow-up, and Stop. Open `composer-session-model`, save an allowed choice during an active Turn, and verify the pending label and the subsequent Turn's recorded model. Check English and Chinese, both themes, and default and large text: the Session composer matches the Bot Conversation composer (attachment button on the left, one line that grows to several), plus one icon-only model button beside Send that shows the current model's brand, also for the default model. Open a long transcript, scroll away from the latest row, and compare its edges with the Bot Conversation screen on the same device. Tap **Jump to latest**, then open and dismiss the keyboard with an unsent draft.


For native Host actions, use the OpenCode Go model on a fresh named isolated Host and drive the CLI. Submit a harmless tool call that asks DSH for approval. Read the card from `session-transcript --session <id>` or `session-live --session <id>`, answer its `requestId` with `session-answer-approval`, then read the same Session until the tool result and model reply are committed. Use `session-answer-question --answer-stdin` on a pending question, `session-stop --session <id>` on an active Turn, and `session-archive --session <id> --confirm` on an idle Session. Compare default inventory and `session-list --include-archived`. M15 C6 exercises the Team member boundary for all four actions. For the phone checks, start a separate Session with a new pending approval and question rather than reusing the CLI Session, whose requests are already answered and which is archived. Open it on the phone: the approval card shows Allow once and Reject (no Always allow); tapping one removes the card and the Turn continues. A pending question card answers with one tap on an option, or Submit for multi-part questions. Archive last: **Archive** in the Session options asks for confirmation, returns to the Sessions list and the Session is gone from it.

For the "needs you" rule and native attention (#4937), keep the same Host. On macOS trial isolation, a plain shell command runs without approval. To raise an approval, ask the model to run `echo` with `sandbox_permissions` requesting escalation; an `ask-user-question` prompt raises a question. While the request waits, `session-list` shows the row with `status: "needs-you"` and `attention: "approval"` or `"question"`. `activity --source all` lists one `native-session-input` item with an empty `botSlug`, and `activity` without `--source` lists none. After `printf '{"nativeSessionAttention":false}' | deepseekbot settings-set botharness-client --patch-stdin`, `activity --source all` drops the item and `activity-status --source all` reports `hasAction: false`, while the list row still needs you. Answering the request clears the item and returns the row to `idle`. M15 C6 checks that a Team member's `activity --source all|native` never shows the item. On the phone, the Activity tab lists each request with a terminal mark and the Session title, **Filter and sort → From → Sessions** keeps only them, and tapping one opens the Session detail. Settings → Sessions → **Session requests in Activity** writes the same setting; with it off, the Activity row and the tab count go away while the Sessions list still shows Needs you.

## Observable proof

Back returns to the origin of each entry. The Sessions list and the detail title capsule show the Session title. The latest row opens above the composer. As the transcript scrolls under the iOS navigation bar or Android top app bar, the shared fade softens its top edge. The transcript also scrolls under the composer. **Jump to latest** returns to the last row, and the focused field stays above the keyboard. Tapping the Session name capsule opens the Session options, with no separate ⋯ button: a native pull-down menu on iOS or an anchored Menu on Android, headed by the full Session name. Archive and Unarchive appear for idle Assignments, and the resulting archive state matches `deepseekbot bot-sessions`. Sent links appear above the message text and newly created links appear below it. Multiple links of the same kind fold into a count button that expands and collapses the chips. A linked Assignment waiting for the Human shows a warning next to its chip. A purged Bot message never shows a Session chip. A direct message shows the Human’s words, and an Inbox-only wake opens through `session-transcript-inbox-disclosure`. A failed Turn shows all recovery text. The selected Session ID and Bot agree with the Host transcript, follow-up, and saved Model Choice. The model switch appears in the timeline and the DM composer lacks a Model Choice chip. An unauthorized Team member cannot read or send to the Session through its route.

On an isolated Host, simulate a failed Sessions read and a failed Assignment details read. Verify that **Try again** restores each read. Keep a cached Sessions list visible through a failed refresh, and keep the Assignment transcript and composer available while retrying its details.

Long-press the text of a Bot message that contains a Session chip. Check that the message actions include Copy and show the recorded model and time. Dismiss the actions, then tap the chip and check that Session detail opens. With a screen reader, check that the message actions and each chip are reachable separately, and that a reply can jump to its original message.

## Gotchas

- A historical Orchestrator can be read. The Host only accepts direct sends to the Bot's current Orchestrator.
- Direct Session commands accept text. The Session composer displays an unavailable attachment control.
- An iOS Simulator capture only covers that Simulator and its installed binary.
