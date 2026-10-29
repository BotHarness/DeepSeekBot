# POCO acceptance — #3202

Source checkpoint: `02707bd9d49447c0733a11d6e5369e0e5cca816c`; integration base: `b73b21f05cd23d29417c867c67ad5b993adf1318`.

Physical POCO / Xiaomi24069PC21G, Android 16, arm64, 1220 × 2712. Direct ADB; isolated QA Host and synthetic conversation. Human Host 39340 was not used. No uninstall or app-data clear. Debug APK SHA-256: `7de821adaff9611ef3b4843d7a8b8cfb8d44b58c927ccd0c22d1f1f4c392b872`; signature matched before `install -r`.

## Results at this checkpoint

| Issue                      | Result                           | Evidence and remaining scope                                                                                                                                                                                                                               |
| -------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #3203 Activity Back        | PASS, tested cases               | System key Back and edge completion dismiss once; explicit scripted ACTION_CANCEL retains the sheet. Physical cancelled-gesture retreat, repeated stress and all filter combinations are not implied. [Before](back-b.mp4), [after](back-a.mp4).           |
| #3204 Settings scroll      | PASS, tested recording           | Slow, fast and reverse scroll recorded before/after. Candidate keeps its scroll viewport fixed while chrome hides. [Before](settings-b.mp4), [after](settings-a.mp4).                                                                                      |
| #3205 short Chats pull     | PASS, tested cases               | Two-row QA list: diagonal row pull, diagonal blank-area pull and straight blank-area pull enter Tob; short pull cancels. Before diagonal gesture stayed in Chats. Empty/long-list combinations still pending.                                              |
| #3206 Marketplace icons    | Diagnostic finding               | Missing icons returned after restoring the original Metro asset service with the same binary/source. No speculative tint change. Bundled Release/offline checks pending.                                                                                   |
| #3207 Marketplace keyboard | NOT RESOLVED                     | Catalogue memoization removes unchanged card/image renders during search open/close; native Debug jank remains. Do not equate React work reduction with smooth native animation. Release qualification pending.                                            |
| #3208 pagination           | PASS, controlled native workload | See fixture protocol below.                                                                                                                                                                                                                                |
| #3209 FAB                  | PASS, menu/navigation cases      | Four renamed root actions; native Import submenu exposes ZIP/Git. System Back returns to root, then closes. Marketplace routes correctly. Opening Git reached existing creation flow; draft preservation caveat below. No Bot import/create was submitted. |

## Draft preservation incident

Opening Git import resumed an existing Bot creation draft. Inspection established that the pre-existing entry flow can persist its source and target environment immediately, before Next, and Close does not roll back. The runner did not edit fields or submit creation, but had backed up unsent chat drafts rather than this separate creation store. No exact pre-entry creation backup was found in the scoped earlier QA artifacts. The current creation record was privately retained; no speculative reconstruction or overwrite was attempted. **Complete creation-draft preservation/restoration cannot be claimed.** Further draft-mutating route tests were stopped. This behavior predates this PR; it is not evidence that the new menu changed creation persistence.

## Controlled pagination protocol

Task-local loopback fixture supplied 40 explicitly synthetic entries through the shipped Marketplace client, parser and resource; only `marketplace.list` was temporarily rebound in memory. No production service, import route, app default URL or security configuration was changed.

- Four-item first page stayed at four until a real drag; near-end scrolling requested offset 4 once.
- Injected HTTP 503 at offset 8 retained all eight rows and displayed the native page Retry action. Tapping Retry requested the same cursor and appended entries 9–12.
- A delayed offset-12 response for `QA3208` completed after Search closed. Current empty-query resource stayed at four entries; only the old query resource grew to 16. No stale rows appended to the current list.
- One-item pages under a fresh query displayed a reachable More action without scrolling. Tapping it appended the next item.
- Earlier apparent non-scrolling samples were invalid: the keyboard still covered the gesture start, despite being absent from the app accessibility XML. They are excluded from product failures.
- Fixture restoration returned `restored: true`. This is Debug fixture evidence, not Release/live-catalogue pagination evidence or TalkBack qualification.

## Performance evidence

Three search-open/close cycles with React profiling reduced recorded React render duration from 1419.6 ms to 601.4 ms and counted component renders from 7279 to 1019; catalogue rows/artwork did not rerender in the candidate. Those initial runs had environment differences and are diagnostic only.

A native-only warmed comparison on the same installed native binary, QA Host and public catalogue did **not** establish a smoothness fix. Baseline samples reported about 7.5–15% janky frames; candidate samples about 12.6–20.3%. Removing the new scroll callback or ignoring IME insets on either native Host did not eliminate jank; all three experimental patches were reverted. Debug percentages are not Release FPS or Human acceptance.

## Checks

- PASS: root lint, format check, typecheck; Android dismissible-drawer unit task.
- Full mobile suite: 2570 passed, 2 failed, 11 skipped (347 files passed, 2 failed, 9 skipped). The two Windows zh-CN expectations also fail independently on baseline: `host-connection.test.tsx` English copy; `marketplace-home.test.tsx` English date formatting.
- Root full suite: INCOMPLETE. Concurrent native compilation and default test-worker load produced timeouts; only this task's run was stopped. Do not report it as passing.
- CI and final native matrix pending at this checkpoint. iOS and Human acceptance are untested.

## Capture provenance

- Activity, Settings and short-pull before footage: retained PR2255 development binary/source (native source `28c7667083f6`, JS `138ca1306bad`); affected baseline implementations were unchanged. After: the integration source/build above.
- `fab-b.png`: baseline JS from the separate `u3203` checkout (`a42bc84efc81`, only Activity native fix over pinned main), on the same newly built integration native binary. FAB source is baseline main. `fab-a.png` and `import.png`: integration source.
- `icons-b.png`: restored original development asset service; `icons-a.png`: integration. These show working glyphs, not a color-code repair.
- Images are actual phone captures, cropped by the same 124-pixel status-bar region and resized to 610 pixels wide. Settings videos additionally crop the upper 700 pixels in both versions to exclude account information. Originals remain private in the shared QA evidence directory. No generated or reconstructed UI.
- Before/after Activity stills show the open sheet; linked recordings, rather than still images, establish dismissal behavior.
- `page-a.png` shows retained synthetic rows and retry. No matched baseline fixture screenshot is available; live baseline catalogue had insufficient pages for this comparison.

## Ownership and handoff

Parent claim: https://github.com/BotHarness/DeepSeekBot/issues/3202#issuecomment-6505744601

Parent task: `codex/local/01a1877d-c8fa-78e0-aa3f-d0af1007be34`. Contributors: Activity `01a18907-697e-7f70-a2c3-223abeef9874`; scroll/pull `01a18907-9b9d-7402-9e1a-b9c826082642`; FAB `01a18908-0325-7882-bf91-1306abc5800f`; Marketplace work is linked through the child issue claims.

At this checkpoint the QA lease and task resources remain active. Final cleanup/settings/pairing checks must be appended before handoff; this document does not certify cleanup yet.
