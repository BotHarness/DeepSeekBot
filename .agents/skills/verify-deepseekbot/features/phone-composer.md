# Native mobile message composer

## Sub-features

Integrated iOS attachment control and taller island, compact and multiline drafts, native attachment menu, dictation controls, expanded editing, system text and keyboard clearance. Android retains its separate attachment button.

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

## Observable proof

Matched native images show the integrated island and reachable controls. Actual typing, attachment, expansion and send actions preserve the draft and produce the expected canonical Channel message. Record source, batch and installed binary identities with pass/fail/untested per step.

## Gotchas

- No private pairing links, tokens, device identifiers or unrelated content in public captures.
- Wait for the current runner to explicitly release shared resources. Web preview, source tests and screenshots alone do not qualify native interaction.
- Composer Stop during dictation stops recording; Bot execution cancellation is a different control and must not be inferred from it.
