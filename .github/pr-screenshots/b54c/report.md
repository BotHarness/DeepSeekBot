# PR 2576 — Batch54 partial native evidence

Actual iOS 27 iPhone 17 Pro Simulator captures, 402 × 874 pt, English,
light appearance, system text size `large`, identical synthetic conversation,
two-line draft and visible software keyboard. Images are unedited captures;
the blinking caret/status-bar return affordance can differ between captures.
Inspected for private content before publication.

| Evidence | Source |
| --- | --- |
| Before (`b.png`) | `d402bb92d80ad9de0d3edbe2a764622752ba83d8` |
| After (`a.png`) | `ea36821ea92904260ba3d78d21db84a3a7d60b13` |
| Native build source | `683b0cbe9c0f158e80929601f59a312ff5f9c4bf` |
| Strict native fingerprint | `2ab2d67bec3a3fd2186c6ea9cf85ceadb07c4b7a` |
| Installed executable SHA256 | `cbf75e97a9776956bca0bcdf081a0dc5da2a6ba858d5bf4fbd26a58e3e5c62e7` |

The Human-approved scoped comparison removes only PR2576 from Before and keeps
the same upload/pairing prerequisites. It is not latest-main or release acceptance;
later splash-screen native inputs are excluded. Both sources use the same freshly
qualified signed Debug development binary and matched Host/data.

## Observations at partial delivery

- Before and After: draft, real keyboard, multiline input, expansion/return and
  attachment-menu operations captured; native six theme/text-size states captured.
- The default light pair is matched. The initial dark pair has different keyboard
  appearance and is withheld pending a matching capture.
- Before: native send/direct DeepSeek reply and canonical exact message passed.
  Further After send, attachment and return-to-latest results remain with the active
  runner; this partial report does not declare them passed.
- Recording did not reach an observed native start in this run after short taps,
  hold, cold launch and icon-region touch. Actual callback/probe identity diagnosis
  continues. No root cause is established, and this is not a reproduction of the
  historical Batch51 immediate-termination sequence. Stop/lock/cancel/transcription
  acceptance remains untested. No simulated recording state or fabricated image.
- Physical microphone, VoiceOver, CJK IME, Android and release acceptance are not
  covered by this Simulator evidence. No all-native-pass claim.

The batch is still active under its sole QA runner. This evidence-only publication
does not change the frozen source, active checkout, native binary or queue lease.


## Dark comparison added 2026-10-22

Native Batch54 Before `d402bb92d80ad9de0d3edbe2a764622752ba83d8` / After `ea36821ea92904260ba3d78d21db84a3a7d60b13`. Same qualified native fingerprint `2ab2d67bec3a3fd2186c6ea9cf85ceadb07c4b7a` and installed executable SHA256 `cbf75e97a9776956bca0bcdf081a0dc5da2a6ba858d5bf4fbd26a58e3e5c62e7`, native source `683b0cbe9c0f158e80929601f59a312ff5f9c4bf`.

`db.png` and `da.png` are unedited native iOS27 Simulator captures, 402×874pt, English, system text size large, dark app and dark software keyboard. Identical synthetic chat, two-line draft, caret at draft end and keyboard candidates. Both were personally inspected; no credentials, private conversations or real account details appear. Earlier dark captures had mismatched keyboard or caret and are not used here.

The images compare #2576 controls, not recording success. Actual touch probes in Batch54 reached onHeld/finalization but not onStart/native speech. Source repair #2592 defers gesture activation until BEGAN and awaits unified native retest; historical immediate termination is not yet reproduced or resolved by native evidence. This compatible scoped comparison excludes later main native splash inputs and is not release acceptance.
