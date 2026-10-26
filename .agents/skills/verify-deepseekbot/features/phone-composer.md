# Native mobile message composer

## Sub-features

Integrated iOS attachment control and taller island, compact and multiline drafts, native attachment menu, dictation controls, expanded editing, local draft save failure and retry, system text and keyboard clearance. Android retains its separate attachment button.

## How to get to it (user POV)

Open a paired computer, then a Human/Bot DM or a group conversation. Use the message field, attachment button and trailing Send or dictation control.

## Driving it with verify-app

Use `docs/agents/device-qa.md` and its designated runner, qualified native client and isolated QA Host. Drive the actual native app by accessible labels or `composer-input`, `composer-attach`, `composer-send`, `composer-expand`, `composer-dictation`, `composer-dictation-cancel` and `jump-to-latest`. Source tests in `apps/mobile/test/dictation.test.ts` and the style/system-text guards do not prove native geometry.

1. Capture matched base/candidate empty and short-draft states: iOS has one continuous rounded surface around +, field and trailing control; default compact height is 56pt and the controls are at least 44pt. Check opaque Reduce Transparency fallback too.
2. Open the real soft keyboard, type several lines and move the caret. Open the native attachment menu with and without the keyboard: Photos, Camera and File are anchored to + without expanding the input area. Dismiss outside, reopen, cancel each available picker and retain the draft; pick and remove an owned fixture, expand/return from editing and preserve the draft and selection. Required controls and the current editing line remain reachable.
3. Repeat light/dark at default, intermediate and maximum system text. Change default → maximum → default live with a draft open; retain the editable field, draft and focus. Record CJK IME, VoiceOver and orientation separately if unavailable.
4. Send a uniquely marked message and read the QA Host Channel timeline: exact text, attachments and mention metadata agree. A Bot reply requires a usable model. Exercise dictation start, cancel and stop with microphone permission; audio/transcription availability is a separate prerequisite.
5. For iOS native controls, tap the entire 44pt target (including its edge), open/close attachments, send exactly once and expand/return without losing input focus or draft. Scroll to history, receive unseen messages, verify the count badge, then tap the native return button and confirm it follows the latest message. Repeat with Reduce Transparency.
6. On iOS, tap the native mic once, observe Starting → Listening and native start/audio events, then tap Stop. Repeat with the explicit Cancel control, permission denial, a second tap while permission is pending and a native interruption/error. A stationary long press must not start on touch-down or stop on release; it has only the native button's activation behavior. Verify centered mic/stop symbols and their full target at all text sizes, cleanup, draft preservation/discard and no automatic send. Record start/audio/error/end and app stop/abort ordering without transcript/audio data; distinguish missing-start from immediate-end. Android retains hold ≥300ms/release, left ≥80pt cancel, up ≥60pt lock and interrupted holds. VoiceOver activation is a separate assistive check, not proven by a mocked callback.
7. Check the unaffected Android separate-button path when its queue/device is available; never infer that result from an iOS capture.
8. On a disposable QA app profile only, use a controlled storage read/write failure at the draft-file boundary with saved text in two conversations. Type a new draft while storage is unavailable: keep it editable, show the save warning and `composer-draft-save-retry`, and disable Send in compact and expanded editing and for the hardware shortcut. Switch conversations and retain their separate in-memory text. Tap Retry with a delayed read: its loading indication and disabled accessibility state appear immediately, repeated activation does not start another retry, and expanding/returning from editing keeps that pending feedback. Restore storage: the warning clears, no message is sent, and reopening the app restores the newest edited draft and the other conversation's saved text. Do not modify a Human's app data to trigger this case. Record an unavailable native fault-injection path as untested; the corresponding automated boundary proof is `apps/mobile/test/source-drafts.test.ts`.

9. On Android with a hardware keyboard and a real CJK input method, compose a candidate and press Enter to confirm it: no Channel message is sent, including input methods that commit a newline or echo a soft key after clearing their composing span. The next fresh Enter sends exactly once in compact editing; expanded editing keeps plain Enter as a newline and Ctrl/Meta+Enter as send. Shift+Enter remains a newline. Start a hardware Enter, change focus or cancel the key, and ensure its late input-method echo cannot send from the new field. Repeat after expanding and returning, and retain the draft. The native View regression is `apps/mobile/modules/hardware-send/android/src/test/java/expo/modules/hardwaresend/HardwareSendViewTest.kt`; Robolectric proves the event chain, while actual input-method behavior remains a device check.

10. On iOS or iPadOS with a physical keyboard and a real CJK input method, begin a candidate and press Command+Return: keep the marked text, draft and selection, with no Channel message sent. Confirm the candidate, then use the next normal Command+Return and observe exactly one message. Move focus outside the composer while a shortcut is pending and ensure its old action cannot send. Repeat in compact and expanded editing. `apps/mobile/modules/hardware-send/ios/Tests/HardwareSendViewTests.swift` covers the real UIKit View→onSend boundary with `setMarkedText`, a cached action and an actual focus transfer; it does not prove a real CJK input method, physical keyboard or selection/latency while streaming.

## Observable proof

Matched native images show the integrated island and reachable controls. Actual typing, attachment, expansion and send actions preserve the draft and produce the expected canonical Channel message. Record source, batch and installed binary identities with pass/fail/untested per step.

## Gotchas

- No private pairing links, tokens, device identifiers or unrelated content in public captures.
- Wait for the current runner to explicitly release shared resources. Web preview, source tests and screenshots alone do not qualify native interaction.
- Composer Stop during dictation stops recording; Bot execution cancellation is a different control and must not be inferred from it.
- A passing draft storage regression does not prove CJK composition, selection, or input latency while replies stream. Those require the actual keyboard and the before/after profiling loop in `apps/mobile/AGENTS.md`.
