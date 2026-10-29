# Native unavailable-group empty state

Physical POCO24069PC21G / Android16 / arm64, 1220×2712, English, dark, font1. Direct SDK ADB; no Windows Computer Use.

`before.png`: prior missing-group state from PR3179 final head f4a3da7d0e98 (batch7d68e5db7f35, evidence38bd32fd5b51). `after.png`: reopened old route, source ba2b564820f018aee12a81dd6cdc50819513aa23, main64df18786d2e plus this UI follow-up. Same device/viewport/locale/theme/font and reopened route state; both use the generic Group info header. Different disposable message fixtures were used; both groups were already absent at capture.

`offline.png`: matching current-source cached conversation while task Host mapping was removed. Desktop UI disbanded that disposable group; restoring only the mapping and pressing Retry produced the Chinese light empty state; `after.png` shows the same state reopened in English dark to match the prior screenshot. The specific cache count changed1→0; details/timeline refuse reads and history is empty in the canonical JSON files.

Matching existing RN0.88.1 / Expo58 arm64 Debug APK SHA256168f5ee0fa864c266407a917e35ff1b752b08c589d4623ebb5deb50b880defc0. Native inputs unchanged; @expo/ui Compose and SwiftUI components already bundled. No install or data clearance in this follow-up. SwiftUI source/type validation is not native iOS acceptance; iOS Simulator/physical iPhone pending#3170. ## Completed matrix

Twelve native combinations PASS: en/zh × light/dark × Android font_scale1/1.3/2. Each capture verifies native centered content, no composer/old messages, enabled visible recovery button, actual return to Chats, and reopening the deleted route. Contact sheets: `empty-en-sheet.png`, `empty-zh-sheet.png`; individual originals and redacted result rows in `matrix.json`. Inspected all12 layouts; maximum fonts wrap without clipping.

Matrix rendered source ba2b564820f018aee12a81dd6cdc50819513aa23. Final source6657ab0d6e90900cc7d685bc75bbdd9896d751f6 adds only a focused-screen guard to keyboard dismissal, with62 focused regressions PASS and mobile types PASS. Reloaded final source for `keyboard-before.png`/`keyboard-after.png`: real IME mInputShown true→false after desktop UI Disband, native centered state, composer absent, canonical reads refuse. Other source fields and native inputs unchanged. All three desktop interactions recorded0 browser console issues. Existing unrelated Debug warnings retained; not a warning-free Release/performance claim.

Current-source ordinary offline cached messages, reconnect terminal transition and cache1→0 PASS. iOS native/Human acceptance remains UNTESTED pending#3170. Host lifecycle is inherited unchanged from3179. No production groups/data or Human Host used.
