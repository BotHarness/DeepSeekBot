# #5050 Android creation sheets: QA evidence

Emulator: Pixel 7 profile (1080×2400, 420 dpi), Android 16 (API 36) x86_64, gesture navigation. Isolated `verify-app` Host named "QA Host", dev client against Metro.
Before = origin/main `fb84b4ce1` (stock react-native-screens Android code). After = PR #5063 head `11313bb23`.

Swipe-down "removed natively" RN errors per pass: before 1–2 per theme/font pass, after 0 in all four passes.

| State | Flow | What | Theme | Font | File |
|---|---|---|---|---|---|
| before | Blank Bot | after Keep Editing (manual repro: sheet gone, prompt again, RN error toast) | light | 1.0× | `android/before-blank-after-keep-editing-reprompt-light-font10.png` |
| before | Blank Bot | after choosing Keep Editing | dark | 1.0× | `android/before-blank-after-keep-editing-dark-font10.png` |
| after | Blank Bot | after choosing Keep Editing | dark | 1.0× | `android/after-blank-after-keep-editing-dark-font10.png` |
| before | Blank Bot | after choosing Keep Editing | dark | 2.0× | `android/before-blank-after-keep-editing-dark-font20.png` |
| after | Blank Bot | after choosing Keep Editing | dark | 2.0× | `android/after-blank-after-keep-editing-dark-font20.png` |
| before | Blank Bot | after choosing Keep Editing | light | 1.0× | `android/before-blank-after-keep-editing-light-font10.png` |
| after | Blank Bot | after choosing Keep Editing | light | 1.0× | `android/after-blank-after-keep-editing-light-font10.png` |
| before | Blank Bot | after choosing Keep Editing | light | 2.0× | `android/before-blank-after-keep-editing-light-font20.png` |
| after | Blank Bot | after choosing Keep Editing | light | 2.0× | `android/after-blank-after-keep-editing-light-font20.png` |
| before | Blank Bot | discard prompt after swipe-down | dark | 1.0× | `android/before-blank-discard-prompt-dark-font10.png` |
| after | Blank Bot | discard prompt after swipe-down | dark | 1.0× | `android/after-blank-discard-prompt-dark-font10.png` |
| before | Blank Bot | discard prompt after swipe-down | dark | 2.0× | `android/before-blank-discard-prompt-dark-font20.png` |
| after | Blank Bot | discard prompt after swipe-down | dark | 2.0× | `android/after-blank-discard-prompt-dark-font20.png` |
| before | Blank Bot | discard prompt after swipe-down | light | 1.0× | `android/before-blank-discard-prompt-light-font10.png` |
| after | Blank Bot | discard prompt after swipe-down | light | 1.0× | `android/after-blank-discard-prompt-light-font10.png` |
| before | Blank Bot | discard prompt after swipe-down | light | 2.0× | `android/before-blank-discard-prompt-light-font20.png` |
| after | Blank Bot | discard prompt after swipe-down | light | 2.0× | `android/after-blank-discard-prompt-light-font20.png` |
| before | Blank Bot | name step with a started draft (expanded) | dark | 1.0× | `android/before-blank-draft-dark-font10.png` |
| after | Blank Bot | name step with a started draft (expanded) | dark | 1.0× | `android/after-blank-draft-dark-font10.png` |
| before | Blank Bot | name step with a started draft (expanded) | dark | 2.0× | `android/before-blank-draft-dark-font20.png` |
| after | Blank Bot | name step with a started draft (expanded) | dark | 2.0× | `android/after-blank-draft-dark-font20.png` |
| before | Blank Bot | name step with a started draft (expanded) | light | 1.0× | `android/before-blank-draft-light-font10.png` |
| after | Blank Bot | name step with a started draft (expanded) | light | 1.0× | `android/after-blank-draft-light-font10.png` |
| before | Blank Bot | name step with a started draft (expanded) | light | 2.0× | `android/before-blank-draft-light-font20.png` |
| after | Blank Bot | name step with a started draft (expanded) | light | 2.0× | `android/after-blank-draft-light-font20.png` |
| before | Blank Bot | opened in dark, expanded, then switched to light at runtime | dark→light | 1.0× | `android/before-blank-switched-dark-to-light-font10.png` |
| after | Blank Bot | opened in dark, expanded, then switched to light at runtime | dark→light | 1.0× | `android/after-blank-switched-dark-to-light-font10.png` |
| before | Blank Bot | opened in dark, expanded, then switched to light at runtime | dark→light | 2.0× | `android/before-blank-switched-dark-to-light-font20.png` |
| after | Blank Bot | opened in dark, expanded, then switched to light at runtime | dark→light | 2.0× | `android/after-blank-switched-dark-to-light-font20.png` |
| before | Blank Bot | opened in light, expanded, then switched to dark at runtime | light→dark | 1.0× | `android/before-blank-switched-light-to-dark-font10.png` |
| after | Blank Bot | opened in light, expanded, then switched to dark at runtime | light→dark | 1.0× | `android/after-blank-switched-light-to-dark-font10.png` |
| before | Blank Bot | opened in light, expanded, then switched to dark at runtime | light→dark | 2.0× | `android/before-blank-switched-light-to-dark-font20.png` |
| after | Blank Bot | opened in light, expanded, then switched to dark at runtime | light→dark | 2.0× | `android/after-blank-switched-light-to-dark-font20.png` |
| before | Blank Bot | sheet on open | dark | 1.0× | `android/before-blank-open-dark-font10.png` |
| after | Blank Bot | sheet on open | dark | 1.0× | `android/after-blank-open-dark-font10.png` |
| before | Blank Bot | sheet on open | dark | 2.0× | `android/before-blank-open-dark-font20.png` |
| after | Blank Bot | sheet on open | dark | 2.0× | `android/after-blank-open-dark-font20.png` |
| before | Blank Bot | sheet on open | light | 1.0× | `android/before-blank-open-light-font10.png` |
| after | Blank Bot | sheet on open | light | 1.0× | `android/after-blank-open-light-font10.png` |
| before | Blank Bot | sheet on open | light | 2.0× | `android/before-blank-open-light-font20.png` |
| after | Blank Bot | sheet on open | light | 2.0× | `android/after-blank-open-light-font20.png` |
| before | Git import | opened in dark, expanded, then switched to light at runtime | dark→light | 1.0× | `android/before-git-switched-dark-to-light-font10.png` |
| after | Git import | opened in dark, expanded, then switched to light at runtime | dark→light | 1.0× | `android/after-git-switched-dark-to-light-font10.png` |
| before | Git import | opened in dark, expanded, then switched to light at runtime | dark→light | 2.0× | `android/before-git-switched-dark-to-light-font20.png` |
| after | Git import | opened in dark, expanded, then switched to light at runtime | dark→light | 2.0× | `android/after-git-switched-dark-to-light-font20.png` |
| before | Git import | opened in light, expanded, then switched to dark at runtime | light→dark | 1.0× | `android/before-git-switched-light-to-dark-font10.png` |
| after | Git import | opened in light, expanded, then switched to dark at runtime | light→dark | 1.0× | `android/after-git-switched-light-to-dark-font10.png` |
| before | Git import | opened in light, expanded, then switched to dark at runtime | light→dark | 2.0× | `android/before-git-switched-light-to-dark-font20.png` |
| after | Git import | opened in light, expanded, then switched to dark at runtime | light→dark | 2.0× | `android/after-git-switched-light-to-dark-font20.png` |
| before | Git import | sheet on open | dark | 1.0× | `android/before-git-open-dark-font10.png` |
| after | Git import | sheet on open | dark | 1.0× | `android/after-git-open-dark-font10.png` |
| before | Git import | sheet on open | dark | 2.0× | `android/before-git-open-dark-font20.png` |
| after | Git import | sheet on open | dark | 2.0× | `android/after-git-open-dark-font20.png` |
| before | Git import | sheet on open | light | 1.0× | `android/before-git-open-light-font10.png` |
| after | Git import | sheet on open | light | 1.0× | `android/after-git-open-light-font10.png` |
| before | Git import | sheet on open | light | 2.0× | `android/before-git-open-light-font20.png` |
| after | Git import | sheet on open | light | 2.0× | `android/after-git-open-light-font20.png` |
| before | ZIP import | opened in dark, expanded, then switched to light at runtime | dark→light | 1.0× | `android/before-zip-switched-dark-to-light-font10.png` |
| after | ZIP import | opened in dark, expanded, then switched to light at runtime | dark→light | 1.0× | `android/after-zip-switched-dark-to-light-font10.png` |
| before | ZIP import | opened in dark, expanded, then switched to light at runtime | dark→light | 2.0× | `android/before-zip-switched-dark-to-light-font20.png` |
| after | ZIP import | opened in dark, expanded, then switched to light at runtime | dark→light | 2.0× | `android/after-zip-switched-dark-to-light-font20.png` |
| before | ZIP import | opened in light, expanded, then switched to dark at runtime | light→dark | 1.0× | `android/before-zip-switched-light-to-dark-font10.png` |
| after | ZIP import | opened in light, expanded, then switched to dark at runtime | light→dark | 1.0× | `android/after-zip-switched-light-to-dark-font10.png` |
| before | ZIP import | opened in light, expanded, then switched to dark at runtime | light→dark | 2.0× | `android/before-zip-switched-light-to-dark-font20.png` |
| after | ZIP import | opened in light, expanded, then switched to dark at runtime | light→dark | 2.0× | `android/after-zip-switched-light-to-dark-font20.png` |
| before | ZIP import | sheet on open | dark | 1.0× | `android/before-zip-open-dark-font10.png` |
| after | ZIP import | sheet on open | dark | 1.0× | `android/after-zip-open-dark-font10.png` |
| before | ZIP import | sheet on open | dark | 2.0× | `android/before-zip-open-dark-font20.png` |
| after | ZIP import | sheet on open | dark | 2.0× | `android/after-zip-open-dark-font20.png` |
| before | ZIP import | sheet on open | light | 1.0× | `android/before-zip-open-light-font10.png` |
| after | ZIP import | sheet on open | light | 1.0× | `android/after-zip-open-light-font10.png` |
| before | ZIP import | sheet on open | light | 2.0× | `android/before-zip-open-light-font20.png` |
| after | ZIP import | sheet on open | light | 2.0× | `android/after-zip-open-light-font20.png` |
