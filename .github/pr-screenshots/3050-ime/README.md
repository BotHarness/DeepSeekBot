# Android keyboard transition evidence — PR #3050

## Frozen builds

Physical Android 16 phone, 1220 × 2712, density 480; non-debuggable arm64 Release; Gboard; font 1.0; dark theme; synthetic draft QA343 / control Bot QA3043. No model requests or messages were sent.

Both builds contain unchanged tag PR #3030 (0b648bc0faef2b3308c340dd2e1ad8cfb75b0b3c). That dependency is included only in the QA integration branch, not in this PR.

| Build  | QA source                                | APK SHA-256                                                      |
| ------ | ---------------------------------------- | ---------------------------------------------------------------- |
| Before | f49b329cd44875006bf5bc78ccb12320f2c74ba9 | 0041be31013d9c8be6a9f5ec142036c0ebd8170e5fe3a386debfb4ccb3e1e2cd |
| After  | 799da76395c3d9017ce4686d3460dd6b35ac20fc | cfe48c312b762b9895f360d4194064faa104b464a07e3400e322ff8a365780e5 |

Baseline is frozen main dc64418e30e11686c2e923995992b8dc415e24a9 plus #3030. Final build contains runtime commits 83b9a1892 (subscriptions) and 9e9c01a6d (menu insets). Later PR changes contain tests, change fragments and evidence only.

The branch later integrated main 81240443e. Its extracted WorkspacePanel now receives the visibility gate through its active prop; the drawer passes shown so subscriptions remain live through closing. Current integration typecheck and workspace lifecycle tests pass. The measurements and screenshots below remain tied to the frozen QA builds above. New native modules and UI from later main are not covered by that phone build; integrated-main native acceptance still needs a fresh queue build.

## Repeated Release measurements

Five alternating runs per build, four surfaces, three real open/close pairs per surface: **240 valid transitions**, zero completed-case operation failures. Order: B1/A1, A2/B2, B3/A3, A4/B4, B5/A5. Every transition checks a full-width real keyboard panel; APK identity and non-debuggable status are checked. No Metro, recorder, profiler or build runs during scoring.

Each cell is median (five-run minimum–maximum). Jank uses native application summary counters over open and close phases. Opening p95 uses exported application frame-completion durations.

| Surface | Before jank %    | After jank %     | Before opening p95 ms | After opening p95 ms |
| ------- | ---------------- | ---------------- | --------------------- | -------------------- |
| name    | 0.74 (0.66–0.77) | 0.55 (0.54–0.64) | 22.89 (22.31–23.12)   | 20.03 (17.02–20.81)  |
| tags    | 0.55 (0.54–0.65) | 0.56 (0.44–0.78) | 18.52 (17.34–19.52)   | 18.02 (15.89–18.58)  |
| search  | 1.27 (0.71–1.28) | 1.27 (1.13–1.42) | 9.69 (9.09–11.39)     | 9.41 (8.73–10.85)    |
| chat    | 0.69 (0.65–1.10) | 0.68 (0.53–0.94) | 17.00 (15.95–19.33)   | 17.05 (14.54–18.90)  |

The name case improves consistently in this sample. Other ranges mostly overlap; this does **not** establish an improvement on every input, zero jank, or 120 FPS. FrameCompleted − IntendedVsync includes pipeline time; it is neither input latency nor an FPS reciprocal. Vendor summary and CSV frame counts differ and are kept separate.

The initial subscription-only candidate did not demonstrate a significant frame-rate improvement in its repeated Release comparison. Diagnosis continued rather than treating the Debug result as sufficient.

One whole partial final B5 group was interrupted by a computer-side ADB listener hang, retained separately and excluded. The whole B5/A5 pair was rerun. First four matched pairs used native USB ADB; the last matched pair used LIBUSB with the same ADB 36 binary and phone. This infrastructure difference limits generalization. Earlier invalid keyboard attempts (visible flag without a real panel), driver-fixture failures and interrupted records remain in private task evidence.

## Single-variable native diagnosis

A separate 30-second Release trace compares the subscription-only candidate (fb56fde70c5c330108f09015528b2ead39c62b39, APK b2053cf69d4df8d974d4be124d0bce829dd68b57487512b0cdd9eb608b299c8c) with the final build. Only the menu-anchor inset flag differs at runtime. Same four real keyboard pairs, Gboard, draft, font and theme. Both traces have zero lost/overwritten/error statistics.

| Application-only trace event  | Before count / time | After count / time |
| ----------------------------- | ------------------- | ------------------ |
| AndroidOwner:measureAndLayout | 2350 / 92.69 ms     | 17 / 22.57 ms      |
| Recomposer:recompose          | 411 / 225.65 ms     | 20 / 21.12 ms      |

The fixed-size menu anchor no longer reads unused animated keyboard viewport insets. Native DropdownMenu Popup still positions the open menu. These counts prove redundant work removal in one diagnostic sample; they do not prove zero presentation jank.

## Native visual and interaction checks

The six final font 1.0 / 1.3 / 2.0 × light / dark checks pass: real keyboard, focused tag caret, reachable Next/Create/Back, retained QA343 name after Back. Only the top 124-pixel status bar is cropped for privacy. Original and cropped SHA-256 values are in [images.json](images.json).

Motion review path: Create Bot → select isolated computer → focus Name → Next → focus Tags → dismiss/reopen keyboard; repeat from Chats search and an empty Channel composer. Header stays mounted; footer remains reachable; draft is retained. Screenshots show layout states, not animation smoothness.

| State          | Before                         | After                         |
| -------------- | ------------------------------ | ----------------------------- |
| name-open      | [Before](b-name-open.png)      | [After](a-name-open.png)      |
| details-closed | [Before](b-details-closed.png) | [After](a-details-closed.png) |
| details-open   | [Before](b-details-open.png)   | [After](a-details-open.png)   |
| search-closed  | [Before](b-search-closed.png)  | [After](a-search-closed.png)  |
| search-open    | [Before](b-search-open.png)    | [After](a-search-open.png)    |

| Font | Dark                 | Light                |
| ---- | -------------------- | -------------------- |
| 1.0  | [Native](m-10-d.png) | [Native](m-10-l.png) |
| 1.3  | [Native](m-13-d.png) | [Native](m-13-l.png) |
| 2.0  | [Native](m-20-d.png) | [Native](m-20-l.png) |

Automated checks: 39 related test files / 325 tests, mobile typecheck, native-menu tests and changelog check pass. Final Release functional checks pass: soft Enter adds native chips; empty/duplicate Enter; first/last chip removal retains committed pending text, focus and keyboard; real Pinyin candidate selection and Chinese chip; Back/Next and Close/Reopen retain name, Chinese chip and pending text; multiline persona growth keeps caret and Create visible; search text; Channel composer unsent draft across navigation; own-computer native menu open/dismiss/reopen and customization Save with keyboard visible. The temporary composer draft was cleared without sending. With Gboard Pinyin, Enter first confirms an active candidate before invoking the field action; driver assumptions about Latin text and the first Chinese candidate were corrected against fresh native evidence. These driver assertions are not counted as scored cases. iOS belongs to another engineer; Human acceptance remains pending. Other devices/IMEs, streaming and long-history stress workloads are outside this measurement.
