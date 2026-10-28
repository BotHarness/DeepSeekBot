# iOS profile fixes: native and model evidence

Main baseline b3f2372e0586 includes #3105 and #3106. Candidate application f16aadec1546. No release, deployment or merge of this candidate.

## #3102: report delivery

The original compressed DSH Session was retained. Its text-only instructions asked for a Markdown final answer and prohibited work tools; the completed native turn contained ordinary assistant text and no `report_to_orchestrator` call. There was no successful report call to lose in iOS.

The complete captured second instruction was replayed through a real Orchestrator-created Assignment using native DSH0.2.1-rc.3 / opencode-go deepseek-v4.1-flash. Before: `activity:error`, no report, native completed turn/no tool calls. After: `activity:idle`, actual report tool success and a persisted `completed` report. The old failed Assignment remains separate; no error was relabelled and no report was fabricated from prose.

The same completed report was also opened in light appearance (`p2.png`); the phone appearance was restored to its original System choice afterwards.

XS Max iOS18.1.1 signed Release (build identity in provenance.json) opened both retained failure and new success through Bot profile → Work → Assignment. `p0.png` and `p1.png` are actual phone PNGs, same final renderer, different immutable before/after runtime results. They prove rendering of canonical Host state, not a renderer change.

Two earlier, less constrained model tasks already succeeded before the fix; those were controls, not reproductions. One extra exact first-case/subagent replay was blocked before Assignment creation by provider AUTH401 (upstream token workspace unavailable). That additional case is UNTESTED after the fix; it is not counted as product failure or silently retried.

## #3104: programmatic profile motion

Actual iOS27 native Settings Switch `REDUCE_MOTION` was read back as1 before qualification. `before.mp4` is a clean b3f2372e0586 page push; `after.mp4` / `dark.mp4` load final candidate code. Before/after PNGs are representative intermediate native video frames, original1320×2868, no UI redraw or aspect-ratio distortion. They are illustrative frames, not equal wall-clock timestamps or an FPS benchmark; use the videos to assess the transition.

A bounded color-boundary check on the synthetic banner also catches the baseline's right-clipped horizontal slide (248 logical points) and finds no such slide in final light/dark fades. Alpha blending over red chat text can hide some blue pixels; an initial naive threshold-only false positive was withdrawn, and the corrected check was rerun against the still-failing baseline. These measurements classify translation, not performance.

PASS: final light/dark programmatic open; Back button return; live preference event/foreground refresh and stale-read protection in focused tests. Physical Reduce Motion and full physical font matrix are UNTESTED; physical report rendering passed separately.

## #3055 / #3105 handoff: bounded native regression

| Check                                                         | iOS27                                     | XS Max18.1.1 | Android                 |
| ------------------------------------------------------------- | ----------------------------------------- | ------------ | ----------------------- |
| Chip opens pushed profile, round Back                         | PASS, light/dark                          | PASS         | UNTESTED (Windows lane) |
| Back button returns to DM                                     | PASS                                      | PASS         | UNTESTED                |
| Native edge-back from profile                                 | FAIL, #3109                               | UNTESTED     | UNTESTED                |
| Chat left swipe opens one profile                             | PASS, dark                                | UNTESTED     | UNTESTED                |
| Central profile tab swipe                                     | PASS, Memory→Files, dark                  | UNTESTED     | UNTESTED                |
| Short chat left/right swipe does not open profile/reply       | PASS, dark                                | UNTESTED     | UNTESTED                |
| Group/pair profile transitions                                | UNTESTED (same options covered in source) | UNTESTED     | UNTESTED                |
| Chats row/last-chat/drawer/search/preview cases               | UNTESTED; invalid setup attempts excluded | UNTESTED     | UNTESTED                |
| Long reply, persistence, offline/multi-select/card exclusions | UNTESTED                                  | UNTESTED     | UNTESTED                |
| Default/middle/max font matrix and VoiceOver speech           | UNTESTED in this pass                     | UNTESTED     | UNTESTED                |

`edge.mp4` records a verified profile start and leading-edge drag: Memory changes to Work instead of returning to the DM. Ordinary-motion and reduced-motion attempts failed. A 24pt hit-region exclusion and animationMatchesGesture prototype did not establish native navigation and were withdrawn; neither is in the PR. The original-main-only cause attribution remains unqualified. The follow-up is #3109 under #2904 / v1.6.0; this report does not call the full gesture handoff passed.

## Verification limits and preserved evidence

138 focused tests and the full mobile suite (2392 passed / 11 skipped), lint, format, typecheck, build and bilingual changelog checks passed for candidate source; CI is reported separately on the PR. Initial setup/readiness mistakes and one React Native Simulator crash during app switching were preserved privately and excluded from successful runs. No crash-fix or performance claim. Selected public images contain synthetic QA app content only; personal Settings, addresses, pairing keys, raw Session reasoning and credentials are excluded.

Private raw action receipts, native snapshots, recordings, CLI results, original Session files and resource manifests remain in the task archive on the Mac. Cleanup and release are recorded separately after the run.

## Later main integration: native acceptance remains separate

After the source-qualified native run, main advanced to78163ab8e612 (#3107). Merge aae3e3e20c02 preserves its transparent native profile header, root-header policy and swipe-entry listeners while applying the live reduced-motion preference. A focused regression also checks that swipe entry remains animation:none and restores fade after its transition. 128 focused integration tests, lint, root/mobile typecheck and build passed. The complete mobile selection initially had2400 PASS/11 skipped/9 timeouts: two loopback-server files could not listen (EPERM). Rerunning only those two files with loopback permission passed all20 cases, yielding2409 PASS/11 skipped combined without double-counting. The initial permission failure is retained; CI is reported separately on the PR.

The native images/videos above still qualify f16aadec1546 only. #3112 took the Simulator after this batch released it, so no new device actor was started for the merge. Native light/dark transition, Back and tab behavior on the combined navigation source remain UNTESTED pending a new explicit device window. The earlier #3109 failure predates #3107 and does not establish whether its new native header fixes that failure.
