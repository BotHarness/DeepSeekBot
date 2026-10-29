# Native unavailable-group empty state

Physical POCO24069PC21G / Android16 / arm64, 1220×2712, English, dark, font1. Direct SDK ADB; no Windows Computer Use.

`before.png`: prior missing-group state from PR3179 final head f4a3da7d0e98 (batch7d68e5db7f35, evidence38bd32fd5b51). `after.png`: reopened old route, source ba2b564820f018aee12a81dd6cdc50819513aa23, main64df18786d2e plus this UI follow-up. Same device/viewport/locale/theme/font and reopened route state; both use the generic Group info header. Different disposable message fixtures were used; both groups were already absent at capture.

`offline.png`: matching current-source cached conversation while task Host mapping was removed. Desktop UI disbanded that disposable group; restoring only the mapping and pressing Retry produced the Chinese light empty state; `after.png` shows the same state reopened in English dark to match the prior screenshot. The specific cache count changed1→0; details/timeline refuse reads and history is empty in the canonical JSON files.

Matching existing RN0.88.1 / Expo58 arm64 Debug APK SHA256168f5ee0fa864c266407a917e35ff1b752b08c589d4623ebb5deb50b880defc0. Native inputs unchanged; @expo/ui Compose and SwiftUI components already bundled. No install or data clearance in this follow-up. SwiftUI source/type validation is not native iOS acceptance; iOS Simulator/physical iPhone pending#3170. Full native matrix report follows.
