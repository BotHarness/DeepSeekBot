# Android sheets, shell and chat presentation

The Android development app uses native form sheets for Bot and group profiles, Android nested scrolling for their lists, and keyboard-frame animation for the chat composer. iOS keeps its existing form-sheet grabber and keyboard implementation.

## Sub-features

- `profile-scroll` scrolls profile content back toward its top before a downward gesture moves the expanded sheet.
- `profile-handle` keeps a visible handle above the list. Dragging it dismisses the sheet; its accessible Close action dismisses it too.
- `settings-scroll` opens Settings through the gear in Chats and applies the same content-first nested scrolling and fixed handle.
- `profile-loading` opens the sheet shell immediately, shows a loading state on first access, then shows cached profile sections on a repeat visit while refreshing them. Refresh failures retain successful sections and expose retry.
- `shell-surfaces` uses a smaller Host title, a persistent animated Host picker, Create beside the channel search, and an Android floating navigation capsule with a distinct tonal surface and an icon-sized selected indicator.
- `chat-keyboard` moves the composer through intermediate positions during the native keyboard animation and keeps it above the final IME bounds.
- `chat-fades` places the lower fade at the message viewport's bottom edge, behind the floating composer rather than extending above it by the composer's height. The message viewport and fade follow the keyboard together; header controls stay above the top fade. Check historical content behind the composer with the keyboard open and closed, and unobscured final content above the floating navigation on Chats and Activity.
- `message-display` offers Streaming and Complete bubbles in Settings. Streaming updates only the changing draft's buffered presentation; Complete bubbles keeps the working indicator and reveals each committed message. The choice is device-local and survives reopening the app.
- `sheet-surfaces` keeps the handle area, header and body on the shared overlay fill, with a quiet handle token and raised groups. Settings, Bot/group profiles and Host appearance reuse the native sheet frame/options.
- `material-settings` uses Android rounded setting groups with accent headings, inset separators, supporting text and selected-row treatment. Open Settings from Chats, enter App icon and return, then change Message display and restart to verify persistence. In a designated QA Bot profile, toggle a local DM activity visibility preference, reopen/restart and confirm the same switch state before restoring it. Repeat light/dark at default/intermediate/maximum system text; required actions and the fixed sheet handle stay reachable. The native build must include SDK 58 `@expo/ui`; a JavaScript reload cannot add its Material 3 switch. Do not enable analytics or remote notifications merely to demonstrate a control.
- `stream-text-reveal` uses a conversation-owned input reserve and semantic grapheme playback, then fades only the active Android prose tail (at most 48 animated spans, with up to eight new spans per update); Reduce Motion skips the fade. Inspect `gentle`, `rhythm` (bursts and input gaps) and a fast long replay while Streaming is selected. Check reserve consumption during an input gap and continued progression through commitment with the same row key, as well as earlier text staying visible. Code/table/native-only blocks follow the playback cursor without the prose glyph fade.
- `history-reading` stops visual playback as soon as a drag begins, keeps the read position while text arrives or commits, and resumes only after returning to the bottom or choosing the jump button. A near-bottom layout callback alone must not resume it. Confirm the canonical complete message still arrives while the displayed prefix is held.
- `offscreen-roster` detaches Chats' roster/Inbox view subscriptions while another route covers it, without stopping either Host transport. Returning to Chats shows the latest state directly; selecting another Host never exposes the held snapshot from the previous one.
- `stream-text-stability` keeps previously displayed Android prose, code and table text visible while a draft grows. Completed Markdown blocks do not rerender on a pure tail append. Draft and settled content use the same Android renderer.
- `stream-caption` shows the streamed content without a separate replying caption below its bubble; an empty streaming bubble keeps its ellipsis placeholder.

## How to get to it (user POV)

- Open a Bot DM or group Channel from Chats, then tap its title to open the profile. Expand the sheet, scroll its content, and drag down within the list. Drag the fixed top handle to close.
- Open the chat again and focus the message input. Watch its movement while the keyboard opens and closes.
- From Chats, tap the Settings gear. Expand and scroll the settings list, drag down within the content, then use the fixed handle. Open the Host picker repeatedly and choose Chats and Activity from the floating navigation; check the final row and fades.
- In Settings → Message display choose Complete bubbles, then open a prepared QA chat and receive a reply. Switch back to Streaming during another reply. Restart the app and check the selected setting. Verify canonical messages through the Host CLI; changing display must not change message bodies or create a second message.

## Driving it with verify-app

Use the designated [shared Windows Android runner](../../../../docs/agents/android-device-qa.md), with a matching active lease, a native development build containing `react-native-keyboard-controller`, Metro, and an isolated paired Host. Seed a QA Bot through the CLI. Do not use a Human's private conversation as test data. A model is unnecessary for these gestures; a real reply must be checked separately when claiming chat/model functionality.

Open the designated QA chat with its keyboard hidden, then run:

```powershell
node scripts/e2e-mobile-android-interactions.mjs --serial <serial> --owner <task> --batch <batch> --title "QA Bot name" --mode profile --label profile
node scripts/e2e-mobile-android-interactions.mjs --serial <serial> --owner <task> --batch <batch> --title "QA Bot name" --mode keyboard --label keyboard
node scripts/e2e-mobile-android-interactions.mjs --serial <serial> --owner <task> --batch <batch> --title "Settings" --mode settings --label settings
```

The profile journey opens the title button, checks the fixed handle, expands and scrolls beyond the profile header, then asserts that a small downward content drag leaves the sheet's native bounds unchanged. It finally drags the handle and checks that the chat input returns. The profile must contain enough content to scroll beyond its header; do not count a short non-scrolling sheet as a pass. Repeat the path in a seeded group to qualify the group surface independently.

The settings journey starts on Chats with its gear visible. Use the localized Settings accessible label (`设置` on the Chinese QA phone). It verifies the fixed handle and the same native bounds after a content drag. The scrollable node must be below the handle; the dimmed underlying chat is not the sheet's list.

For profile loading, hold one section request pending and observe the shell/loading state. Repeat with cached data and a refused refresh, checking that earlier successful values remain alongside a retry notice. Unit tests cover pending/cache reconciliation; a native motion recording qualifies opening latency.

For streaming, replay identical content/chunks/timing from an isolated local model through the real Host. Include Chinese paragraphs, a long paragraph, emoji, unfinished code and tables, interruption, and multiple bubbles. Save a native recording and inspect text persistence during appends, not just the final screenshot. Count historical and draft row renders separately. Alternate at least three runs per version when reporting profiler comparisons; a 120 Hz display or an 80 ms text buffer alone does not prove 120 FPS.

Use the loopback [fixed-replay and video-check instructions](../../../../apps/mobile/scripts/stream-replay.md) for the deterministic fixture. Pair each visibility check with the designated chat, native recording, and exact committed reply from `deepseekbot send`. A second unsolicited reply invalidates the run. In Complete bubbles mode, check both the waiting window and the completed window, then force-stop/reopen and inspect the selected setting without setting it again. A blank-screen waiting check alone is insufficient.

The keyboard journey requires `ffmpeg` on PATH and the dark portrait QA theme. It captures a five-second native screen recording, focuses the empty composer, checks the final input bounds against the real Android IME, and tracks the composer fill at 30 fps. It fails `COMPOSER_JUMPS` when the movement has fewer than four intermediate positions or one frame contains at least half the travel. Keep the theme, IME, viewport, draft and frame rate fixed across A/B runs. Read the MP4 too: the bounded pixel check detects a jump and final overlap, not every possible timing defect.

For the Android navigation island, cold-open Chats and switch to Activity in light/dark at system font scales 1, 1.3 and 2. Capture both tabs and native accessibility bounds: exactly two enabled tab targets, selected state, readable labels and a plain tabular pending number replacing the Activity icon only while Chats is selected; each target is at least 48dp and stays inside the safe viewport. Confirm icon/label groups are vertically centered (native visible-content offset within3dp at default size), the selected highlight is no wider than44dp around its40dp icon frame, and the icon/count slot stays centered inside its target with one accessible tab name with the same capped count. Switch tabs and confirm the icon/number transition finishes with an icon on selected Activity and a number on Chats. Check zero-count icon and 99+ display when the fixture supplies those counts, otherwise record them as untested. Confirm the faint single shadow, compact rounded rectangle at default size, expanded geometry at large text, scroll hide/reveal on a long Activity page, a short Chats list that keeps navigation visible, and no bar inside a pushed chat. Restore the original system font/theme. Edge-back cancellation must retain the pushed page; completing must pop once. The current stable Stack does not provide the reference's intra-app predictive preview; do not count a system back-to-home animation as proof.

From global Settings → Activity count, verify tool approvals is the sole initial selection. Add another type that has a known pending QA item, close Settings and confirm the navigation count changes. Reopen after a cold launch and confirm both switches remain selected. Selecting none shows the icon; restore the original selections after the run. At font scales1/1.3/2 in light/dark, reach all six native switches, verify their checked/enabled states, scroll to the footer and return through the drawer's back button. Counts refer to unique selected attention items or unread conversations, not unread message totals; visual and accessible numbers saturate at99+. These choices must not modify push settings or resolve an approval.

## Gotchas

PNG/XML, MP4 and JSON proof stay in the batch's machine-local evidence directory. The script refuses capture on a pairing-link screen. It does not create a Host, change a model, send a message, erase storage, or prove iOS behavior, notifications or background delivery.

Android accessibility can include the dimmed chat behind the sheet. Check the title within the sheet list bounds. The keyboard pixel detector samples unused input space beside the microphone; placeholder glyphs must not stand in for composer movement. A missing or obscured composer still fails the motion check.
