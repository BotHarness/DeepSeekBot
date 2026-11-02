# Android creation shell — physical-phone QA

Issue #2958. Agent task: `codex/local/01a17bef-21c0-75f0-bf5d-2fedb6df7b73`.

## What was exercised

Physical POCO 24069PC21G, Android 16, 1220 × 2712, density 480, gesture navigation, zh-CN. The phone and isolated QA Host were reserved through the Human-authorized Windows batch. No model calls or external messages were needed.

- One persistent native header, live name/avatar and progress; Next/Back move the nested body. Close leaves the whole flow and retains the draft. The recording shows actual forward/back transitions and avatar changes.
- Git and Zip entry → source-selection pages retain this shell. System Back from the first Git page returns to Chats.
- Actual native filled fields and keyboard open/close; the lowest Tags field scrolls above the pinned actions. Checked at maximum system font 2.0 in dark mode, including real Gboard `nihao` composition, selecting `你好`, closing and restoring that draft.
- Default 1.0, intermediate 1.3 and maximum 2.0 system fonts × light/dark. Twelve after captures were made with the OS value and actual rendered theme checked. Eleven matched before/after pairs are included; default dark identity is excluded because the original capture had a different accent. The default dark Persona pair covers that header/theme instead.
- Native Create produced one `M3FlowQA` Bot on the dedicated Host, opened its DM, and Back returned directly to Chats. Independent Host CLI `list` confirmed exactly one such identity. No test message was sent.

## Provenance

Visual before source: `1cc640dd2cc9af76c3c3ff1885f6b64d593699ef` (base plus native boot prerequisite #2947), rendered through a development client. After: frozen QA integration `b7ade24bcd5a3fa4c5cd3ca0ca8c67194a158462`, non-debuggable development-ID Release. Its APK SHA-256 is `3014fccfa7dbf4ee150f072ddb5ef2fa4362e4bfc6364541b482fa416a3ae027`.

The integration contains the feature code and #2947. The feature's final code tree is equivalent to `467172dd4c6a0b5582e2eb3b68091dca84884acb`; the preceding local feature commits were rewritten only to add required task trailers. Compared with that feature revision, the integration's only mobile differences are the separate #2947 step-bar contract extraction. #2947 has since merged independently. Public URLs remain unchanged despite moving their files under a route group.

`captures.json` maps each public PNG to its source, time and SHA-256. Only the status bar was cropped and the image resized proportionally. The old development-client gear remains visible in before images; no UI was painted over. `flow.mp4` is a cropped/resized actual 60-fps-limit scrcpy recording, used for interaction review, not frame-rate qualification.

## Release keyboard comparison

The performance baseline is **the initial native-field implementation before the persistent shell and keyboard changes**, source `12e774cbdf9c7ab2bf0e77d1da9707797feb6916`, APK SHA-256 `08c9d24cdebdcf081f499842d26a3178ae288ea536c3ea1ae6853f13a2089fa5`. It is distinct from the original visual baseline above.

Five alternating A/B runs installed the frozen baseline/candidate APKs on the same phone. Each cold-started the app, entered Environment → Name, then performed six real keyboard open/close pairs. Both packages were verified non-debuggable; the installed APK hash was read back each run. Same Gboard input method, default font, theme and test draft. No profiler or recorder was attached. Platform counters were reset separately for every actual transition, and IME visibility was asserted after every open/close.

| Run | Baseline janky / rendered | Candidate janky / rendered |
| --- | ------------------------- | -------------------------- |
| 1   | 14 / 1409 (0.994%)        | 2 / 1907 (0.105%)          |
| 2   | 13 / 1423 (0.914%)        | 2 / 1905 (0.105%)          |
| 3   | 15 / 1427 (1.051%)        | 2 / 1899 (0.105%)          |
| 4   | 6 / 1429 (0.420%)         | 2 / 1913 (0.105%)          |
| 5   | 16 / 1415 (1.131%)        | 2 / 1885 (0.106%)          |

Both sides completed 30 pairs with zero failed IME transitions. Total janky frames: 64 / 7103 → 10 / 9509; per-run median proportion: 0.994% → 0.105%. Rendered counts differ, so the absolute janky counts are included. These are Android platform counters, not an FPS estimate.

First-open p95 remains similar: baseline 28–36ms, candidate 27–34ms. Warm-open p95 is 11–18ms versus 13–21ms, while warm-close is 12–28ms versus 12–22ms. The candidate reduces reported jank in this scenario; it does **not** improve every phase or establish 120 FPS. Thermal/clock state was not controlled, and this single phone/IME does not qualify all devices. `keyboard.json` preserves each phase's counters and installed hash.

To repeat: reserve the phone; install each frozen APK with data retained; use the same IME/font/theme/draft; cold launch → Create Bot → Environment → Next → Name; reset `dumpsys gfxinfo` per transition, tap Name, wait for the IME, collect counters, then repeat with Back. Alternate at least five runs and keep profiler/recording separate.

## Source checks and remaining acceptance

Separate development-client profiles drove the same eight IME pairs. React recorded 71 → 65 commits, 1838.9 → 1182.1ms total render work, and 157 → 89.4 components per commit. Recording windows differ (30.2s → 25.9s), so these diagnostic totals explain reduced rendering work and are not a Release speedup or frame-rate claim. Raw CPU/React traces remain private with the local evidence index.

112 related test files / 872 tests passed before the native-focus addition; its 25 related files / 318 tests passed afterward. Mobile typecheck, repository lint and full formatting checks passed. These source checks do not replace native checks.

iOS native routing, keyboard and large-text acceptance is **untested on this Windows lane**. Native loss-of-response/recovery faults were previously qualified for #2930; they were not re-injected for this UI refactor. Human visual/motion acceptance and CI remain separate gates. Expo Web cannot render the changed Compose controls and is not offered as their visual evidence. No merge is authorized by these results.
