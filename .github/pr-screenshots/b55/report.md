# Batch55 native progress (partial)

Frozen JS and Host candidate: `87724a3b58d556807ef1ba860adcbb96bda6d92f`. Existing QA iOS27, Debug development build; strict native fingerprint `b3e74315f0c2d639dd1c1ff73e56182e0fb86c0e`, installed executable SHA-256 `55de08577ac5ddb38fb0221427750b8d5096dfe10b55a1561bb438c3bf95807a`. Same-source Simulator entitlement relink resolved a local unsigned-package Keychain qualification failure. Earlier unsigned package hashes are historical.

| Case | Result | Actual evidence and limits |
| --- | --- | --- |
| First short DM | PASS, light/large | Real composer send to empty-history Bot, direct DeepSeek reply `QA55-READY` visible above keyboard without scroll/reload; canonical revision2. No continuous short-case video. |
| First long DM | PASS, light/large | Different empty-history Bot, 80-line/6959-character direct DeepSeek response; 32.1s video and sampled contact sheet show streaming follows latest. Final `QA55_TAIL_80` visible above composer/keyboard, no scroll/reload. |
| Channel question | PASS, light/large | Actual Light choice; original request resolved at revision3, same session resumed with `ANSWER_QA55: Light` at revision4. |
| Activity question | PASS, dark/large | Actual Dark choice clears Needs you; original request resolved at revision7, same session resumed with `ACTIVITY_QA55: Dark` at revision8. |
| Recording #2592 | FAIL | Real tap and800ms hold each reach onHeld only, no onStart/availability/permissions/native events. Loaded Hermes module has the merged onBegin activation code. Observers remained current and were explicitly restored. |
| Account computer list #2583 | NOT RUN | Native signed-out page reaches the login form; Human login is pending. No account created or deleted. |

Activity's XCTest driver repeatedly failed with an infinite-coordinate accessibility exception. Those attempts did not answer the question. The single failed driver session was closed; a real click in the existing Device Hub window completed the same pending question. This is a documented test-driver limitation, not a hidden product pass.

Screenshots contain synthetic task-owned chats only. The long-reply contact sheet samples the video and is not a full frame-by-frame performance analysis. Header translucency and the microphone icon alignment remain visible; they are not retouched. #2595's later native-button repair is outside this frozen batch and has no native pass here.

Still untested: matched Before comparisons, complete light/dark × three-size matrix, cross-Host isolation, account multi-add/duplicate/cancel/failure and outer encrypted capture,50+message cold history/scroll hold, full row/refresh/menu/drawer matrix, recording stop/cancel/interruption/transcription, Android, physical XS Max, VoiceOver/CJK/orientation, Release performance and Human QA. Earlier batches do not substitute for these cases.

This candidate is **NOT accepted for release**. The batch retains its exclusive lease for pending login and remaining acceptance; its three test Bots, task pairing and dedicated services are recorded for later cleanup. No product merge or release is performed by this coordinator.
